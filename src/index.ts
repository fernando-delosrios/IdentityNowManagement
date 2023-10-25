import {
    Context,
    createConnector,
    readConfig,
    Response,
    logger,
    StdAccountListOutput,
    StdAccountReadInput,
    StdAccountReadOutput,
    StdTestConnectionOutput,
    ConnectorError,
    StdEntitlementListOutput,
    StdEntitlementReadInput,
    StdEntitlementReadOutput,
    AttributeChangeOp,
    StdAccountUpdateInput,
    StdAccountUpdateOutput,
    StdAccountCreateInput,
    StdAccountCreateOutput,
    StdAccountListInput,
    StdEntitlementListInput,
    ConnectorErrorType,
    StdAccountDiscoverSchemaOutput,
    StdAccountDisableInput,
    StdAccountDisableOutput,
    StdAccountEnableInput,
    StdAccountEnableOutput,
} from '@sailpoint/connector-sdk'
import { AccountResponse } from './model/account'
import { Level } from './model/level'
import { Workgroup } from './model/workgroup'
import { levels } from './data/levels'
import { LCS, LCSSource } from './model/lcs'
import { SDKClient } from './sdk-client'
import {
    BaseAccount,
    IdentityBeta,
    IdentityDocument,
    ListWorkgroupMembers200ResponseInnerV2,
    Owner,
    WorkflowBeta,
    WorkgroupDtoBeta,
} from 'sailpoint-api-client'

import { EmailWorkflow } from './model/emailWorkflow'
import { ErrorEmail } from './model/email'

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

const safeList = (object: any) => {
    let safeList: any[]
    if (typeof object === 'string') {
        safeList = [object]
    } else if (object === undefined) {
        safeList = []
    } else {
        safeList = object
    }
    return safeList
}

const WORKFLOW_NAME = 'IdentityNow Management - Email sender'

type WorkgroupWithMembers = WorkgroupDtoBeta & {
    members: ListWorkgroupMembers200ResponseInnerV2[]
}

// Connector must be exported as module property named connector
export const connector = async () => {
    // Get connector source config
    const config = await readConfig()
    const { removeGroups, enableLevels, enableWorkgroups, enableLCS } = config
    const client = new SDKClient(config)

    const getWorkgroupEntitlements = async (): Promise<Workgroup[]> => {
        const entitlements: Workgroup[] = []
        const workgroups = await client.listWorkgroups()
        for (const w of workgroups) {
            entitlements.push(new Workgroup(w))
        }

        return entitlements
    }

    const getLCSEntitlements = async (): Promise<LCS[]> => {
        const entitlements: LCS[] = []
        const identityProfiles = await client.listIdentityProfiles()
        for (const ip of identityProfiles) {
            const states = await client.listLifecycleStates(ip.id as string)
            for (const s of states) {
                const state: LCSSource = {
                    name: `${ip.name} - ${s.name}`,
                    value: s.id as string,
                    description: `${s.name} lifecycle state for ${ip.name} identity profile`,
                }
                entitlements.push(new LCS(state))
            }
        }

        return entitlements
    }

    const getLevelEntitlements = (): Level[] => {
        return levels.map((x) => new Level(x))
    }

    const getWorkgroupsWithMembers = async (): Promise<WorkgroupWithMembers[]> => {
        const workgroups: WorkgroupWithMembers[] = []
        const wgs = await client.listWorkgroups()

        for (const w of wgs) {
            const members = await client.listWorkgroupMembers(w.id as string)
            const workgroup = { ...w, members } as WorkgroupWithMembers
            workgroups.push(workgroup)
        }

        return workgroups
    }

    const getAssignedWorkgroups = async (id: string, groups?: WorkgroupWithMembers[]): Promise<string[]> => {
        logger.info('Fetching workgroups')
        let workgroups: WorkgroupWithMembers[]
        if (groups) {
            workgroups = groups
        } else {
            workgroups = await getWorkgroupsWithMembers()
        }
        const assignedWorkgroups = workgroups.filter((w) => w.members.find((a) => a.externalId == id)).map((w) => w.id!)

        return assignedWorkgroups
    }

    const getAssignedLevels = async (id: string, privilegedUsers?: IdentityDocument[]): Promise<string[]> => {
        logger.info('Fetching levels')
        let levels: string[]
        let accounts: BaseAccount[]
        if (privilegedUsers) {
            const privilegedUser = privilegedUsers.find((x) => x.id === id)
            if (privilegedUser) {
                accounts = privilegedUser.accounts as BaseAccount[]
            } else {
                accounts = []
            }
        } else {
            accounts = (await client.listAccountsByIdentity(id)).map((x) => ({
                source: {
                    id: x.sourceId,
                    name: x.sourceName,
                },
                entitlementAttributes: x.attributes,
            }))
        }
        const idnAccount = accounts.find(
            (x) => x.source!.name === 'IdentityNow' || (x.source && x.source.name === 'IdentityNow')
        )
        if (idnAccount) {
            const attributes = idnAccount.entitlementAttributes
            levels = safeList(attributes ? attributes.assignedGroups : undefined)
        } else {
            levels = []
        }

        levels.push('user')

        return levels
    }

    const getAssignedLCS = async (rawAccount: IdentityBeta): Promise<string | null> => {
        logger.info('Fetching LCS')
        let lcs: string | null = null
        if (rawAccount.lifecycleState && rawAccount.lifecycleState.manuallyUpdated) {
            lcs = await getLCSByName(
                rawAccount.lifecycleState.stateName,
                (rawAccount.attributes as any).cloudAuthoritativeSource
            )
        }

        return lcs
    }

    const getLCSByName = async (name: string, source: string): Promise<string | null> => {
        let lcs: string | null = null
        const identityProfiles = await client.listIdentityProfiles()
        const identityProfile = identityProfiles.find((x) => x.authoritativeSource.id === source)
        if (identityProfile) {
            const states = await client.listLifecycleStates(identityProfile.id as string)
            const lcsObject = states.find((x) => x.technicalName === name)
            if (lcsObject) lcs = lcsObject.id as string
        }

        return lcs
    }

    const isValidLCS = async (lcsID: string, source: string): Promise<boolean> => {
        let found = false
        const identityProfiles = await client.listIdentityProfiles()
        const identityProfile = identityProfiles.find((x) => x.authoritativeSource.id === source)
        if (identityProfile) {
            const states = await client.listLifecycleStates(identityProfile.id as string)
            found = states.find((x) => x.id === lcsID) ? true : false
        }

        return found
    }

    const buildAccount = async (
        rawAccount: IdentityBeta,
        workgroups?: any[],
        privilegedUsers?: IdentityDocument[]
    ): Promise<AccountResponse> => {
        const uid = (rawAccount.attributes as any).uid
        logger.info(`Building account with uid ${uid}`)
        const account: AccountResponse = new AccountResponse(rawAccount)

        if (enableLevels) {
            account.attributes.levels = await getAssignedLevels(account.identity, privilegedUsers)
        }

        if (enableWorkgroups) {
            account.attributes.workgroups = await getAssignedWorkgroups(account.identity, workgroups)
        }

        if (enableLCS) {
            account.attributes.lcs = await getAssignedLCS(rawAccount)
        }

        return account
    }

    const provisionWorkgroups = async (action: AttributeChangeOp, id: string, workgroups: string[]) => {
        for (const workgroup of workgroups) {
            logger.info(`Governance Group| Executing ${action} operation for ${id}/${workgroup}`)
            if (action === AttributeChangeOp.Add) {
                await client.addWorkgroup(id, workgroup)
            } else if (action === AttributeChangeOp.Remove) {
                await client.removeWorkgroup(id, workgroup)
            }
        }
    }

    const provisionLevels = async (action: AttributeChangeOp, id: string, levels: string[]) => {
        logger.info(`Levels| Executing ${action} operation for ${id}/${levels}`)
        const capabilities = await client.getCapabilities(id)
        let resultingRoles: string[] = []
        if (action === AttributeChangeOp.Add) {
            resultingRoles = [...levels, ...capabilities]
        } else if (action === AttributeChangeOp.Remove) {
            resultingRoles = capabilities.filter((x) => !levels.includes(x))
        }

        await client.setCapabilities(id, resultingRoles)
    }

    const provisionLCS = async (action: AttributeChangeOp, id: string, lcs: string) => {
        logger.info(`LCS| Executing ${action} operation for ${id}/${lcs}`)

        if (action === AttributeChangeOp.Remove) {
            logger.info('Ignoring LCS removal request')
        } else {
            await client.setLifecycleState(id, lcs)
        }
    }

    const getAccount = async (id: string): Promise<AccountResponse> => {
        logger.info(`Getting details for account ID ${id}`)
        const rawAccount = await client.getAccountDetails(id)
        const account = await buildAccount(rawAccount)
        return account
    }

    const getWorkflow = async (name: string): Promise<WorkflowBeta | undefined> => {
        const workflows = await client.listWorkflows()

        return workflows.find((x) => x.name === name)
    }

    const workflow = await getWorkflow(WORKFLOW_NAME)
    if (workflow) {
        logger.info('Email workflow already present')
    } else {
        const accessToken = await client.config.accessToken
        const jwt = jwt_decode(accessToken as string) as any
        const identityId = jwt.identity_id
        const owner: Owner = {
            id: identityId,
            type: 'IDENTITY',
        }
        const emailWorkflow = new EmailWorkflow(WORKFLOW_NAME, owner)
        await client.createWorkflow(emailWorkflow)
    }

    const logErrors = async (workflow: WorkflowBeta | undefined, context: Context, input: any, errors: string[]) => {
        let lines = []
        lines.push(`Context: ${JSON.stringify(context)}`)
        lines.push(`Input: ${JSON.stringify(input)}`)
        lines.push('Errors:')
        lines = [...lines, ...errors]
        const message = lines.join('\n')
        const recipient = await client.getIdentity(workflow!.owner!.id as string)
        const email = new ErrorEmail(recipient!.attributes!.email, message)

        if (workflow) {
            await client.testWorkflow(workflow!.id!, email)
        }
    }

    return createConnector()
        .stdTestConnection(async (context: Context, input: undefined, res: Response<StdTestConnectionOutput>) => {
            logger.info('Test successful!')
            res.send({})
        })
        .stdAccountList(async (context: Context, input: StdAccountListInput, res: Response<StdAccountListOutput>) => {
            const errors: string[] = []

            try {
                const groups: WorkgroupWithMembers[] = await getWorkgroupsWithMembers()
                const privilegedUsers = await client.listPrivilegedIdentities()

                const identities = await client.listIdentities()

                for (const identity of identities) {
                    const account = await buildAccount(identity, groups, privilegedUsers)
                    const levels = account.attributes.levels as string[]
                    const workgroups = account.attributes.workgroups as string[]
                    const lcs = account.attributes.lcs as string | null
                    if (levels.length > 1 || workgroups.length > 0 || lcs) {
                        logger.info(account)
                        res.send(account)
                    }
                }
            } catch (e) {
                if (e instanceof Error) {
                    logger.error(e.message)
                    errors.push(e.message)
                }
            }

            if (errors.length > 0) {
                await logErrors(workflow, context, input, errors)
            }
        })
        .stdAccountRead(async (context: Context, input: StdAccountReadInput, res: Response<StdAccountReadOutput>) => {
            const errors: string[] = []

            let account: AccountResponse | undefined
            try {
                logger.info(input)
                account = await getAccount(input.identity)
            } catch (e) {
                if (e instanceof Error) {
                    logger.error(e.message)
                    errors.push(e.message)
                }
            }

            if (account) {
                logger.info(account)
                res.send(account)
            } else {
                throw new ConnectorError('Account not found', ConnectorErrorType.NotFound)
            }

            if (errors.length > 0) {
                await logErrors(workflow, context, input, errors)
            }
        })
        .stdEntitlementList(
            async (context: Context, input: StdEntitlementListInput, res: Response<StdEntitlementListOutput>) => {
                const errors: string[] = []

                try {
                    logger.info(input)
                    let entitlements: StdEntitlementListOutput[] = []
                    switch (input.type) {
                        case 'level':
                            if (enableLevels) {
                                entitlements = getLevelEntitlements()
                            }
                            break

                        case 'workgroup':
                            if (enableWorkgroups) {
                                entitlements = await getWorkgroupEntitlements()
                            }
                            break

                        case 'lcs':
                            if (enableLCS) {
                                entitlements = await getLCSEntitlements()
                            }
                            break

                        default:
                            throw new ConnectorError(`Unsupported entitlement type ${input.type}`)
                    }
                    for (const e of entitlements) {
                        logger.info(e)
                        res.send(e)
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        logger.error(e.message)
                        errors.push(e.message)
                    }
                }

                if (errors.length > 0) {
                    await logErrors(workflow, context, input, errors)
                }
            }
        )
        .stdEntitlementRead(
            async (context: Context, input: StdEntitlementReadInput, res: Response<StdEntitlementReadOutput>) => {
                const errors: string[] = []

                try {
                    logger.info(input)
                    let entitlement: StdEntitlementReadOutput | undefined

                    switch (input.type) {
                        case 'level':
                            entitlement = getLevelEntitlements().find((x) => input.identity === x.identity)
                            break

                        case 'workgroup':
                            const workgroup = await client.getWorkgroup(input.identity)
                            entitlement = new Workgroup(workgroup)
                            break

                        case 'lcs':
                            entitlement = (await getLCSEntitlements()).find((x) => input.identity === x.identity)
                            break

                        default:
                            throw new ConnectorError(`Unsupported entitlement type ${input.type}`)
                    }

                    if (entitlement) {
                        logger.info(entitlement)
                        res.send(entitlement)
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        logger.error(e.message)
                        errors.push(e.message)
                    }
                }

                if (errors.length > 0) {
                    await logErrors(workflow, context, input, errors)
                }
            }
        )
        .stdAccountCreate(
            async (context: Context, input: StdAccountCreateInput, res: Response<StdAccountCreateOutput>) => {
                const errors: string[] = []

                try {
                    logger.info(input)
                    const rawAccount = await client.getIdentityByUID(input.attributes.uid as string)
                    if (rawAccount) {
                        if ('levels' in input.attributes) {
                            const levels = [].concat(input.attributes.levels).filter((x) => x !== 'user')
                            await provisionLevels(AttributeChangeOp.Add, rawAccount.id, levels)
                        }

                        if ('workgroups' in input.attributes) {
                            const workgroups = [].concat(input.attributes.workgroups)
                            await provisionWorkgroups(AttributeChangeOp.Add, rawAccount.id, workgroups)
                        }

                        if ('lcs' in input.attributes) {
                            if (
                                await isValidLCS(input.attributes.lcs, rawAccount.attributes!.cloudAuthoritativeSource)
                            ) {
                                await provisionLCS(AttributeChangeOp.Add, rawAccount.id, input.attributes.lcs)
                            } else {
                                logger.info(`Invalid lcs ${input.attributes.lcs}. Skipping.`)
                            }
                        }

                        const account = await getAccount(rawAccount.id)

                        logger.info(account)
                        res.send(account)
                    } else {
                        throw new ConnectorError(`Unable to find ${input.attributes.uid} UID`)
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        logger.error(e.message)
                        errors.push(e.message)
                    }
                }

                if (errors.length > 0) {
                    await logErrors(workflow, context, input, errors)
                }
            }
        )
        .stdAccountUpdate(
            async (context: Context, input: StdAccountUpdateInput, res: Response<StdAccountUpdateOutput>) => {
                const errors: string[] = []

                try {
                    logger.info(input)

                    if (input.changes) {
                        for (const change of input.changes) {
                            switch (change.attribute) {
                                case 'levels':
                                    const levels = [].concat(change.value).filter((x) => x !== 'user')
                                    await provisionLevels(change.op, input.identity, levels)
                                    break
                                case 'workgroups':
                                    const workgroups = [].concat(change.value)
                                    await provisionWorkgroups(change.op, input.identity, workgroups)
                                    break
                                case 'lcs':
                                    const rawAccount = await client.getAccountDetails(input.identity)
                                    const cloudAuthoritativeSource = (rawAccount.attributes as any)
                                        .cloudAuthoritativeSource
                                    if (await isValidLCS(change.value, cloudAuthoritativeSource)) {
                                        await provisionLCS(change.op, input.identity, change.value)
                                    } else {
                                        logger.info(`Invalid lcs ${change.value}. Skipping.`)
                                    }
                                    break
                                default:
                                    break
                            }
                        }
                        //Need to investigate about std:account:update operations without changes but adding this for the moment
                    } else if ('attributes' in input) {
                        logger.warn(
                            'No changes detected in account update. Please report unless you used attribute sync which is not supported.'
                        )
                    }

                    const account = await getAccount(input.identity)

                    logger.info(account)
                    res.send(account)
                } catch (e) {
                    if (e instanceof Error) {
                        logger.error(e.message)
                        errors.push(e.message)
                    }
                }

                if (errors.length > 0) {
                    await logErrors(workflow, context, input, errors)
                }
            }
        )
        .stdAccountDisable(
            async (context: Context, input: StdAccountDisableInput, res: Response<StdAccountDisableOutput>) => {
                const errors: string[] = []
                const NOTFOUND_ERROR = 'Identity not found'
                let identity: IdentityDocument | undefined
                try {
                    logger.info(input)
                    identity = await client.getIdentity(input.identity)
                    if (identity) {
                        let account = await getAccount(input.identity)
                        const idnAccount = identity.accounts!.find(
                            (x) => x.source!.name === 'IdentityNow' || (x.source && x.source.name === 'IdentityNow')
                        ) as BaseAccount

                        await client.disableAccount(idnAccount.id!)
                        await sleep(5000)
                        if (removeGroups) {
                            const levels = (account.attributes.levels as string[]) || []
                            await provisionLevels(AttributeChangeOp.Remove, input.identity, levels)
                            const workgroups = (account.attributes.workgroups as string[]) || []
                            await provisionWorkgroups(AttributeChangeOp.Remove, input.identity, workgroups)
                        }
                        account = await getAccount(input.identity)

                        logger.info(account)
                        res.send(account)
                    } else {
                        throw new Error(NOTFOUND_ERROR)
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        logger.error(e.message)
                        errors.push(e.message)
                    }
                }

                if (errors.length > 0) {
                    await logErrors(workflow, context, input, errors)
                }

                if (!identity) {
                    throw new Error(NOTFOUND_ERROR)
                }
            }
        )

        .stdAccountEnable(
            async (context: Context, input: StdAccountEnableInput, res: Response<StdAccountEnableOutput>) => {
                const errors: string[] = []
                const NOTFOUND_ERROR = 'Identity not found'
                let identity: IdentityDocument | undefined

                try {
                    logger.info(input)
                    identity = await client.getIdentity(input.identity)
                    if (identity) {
                        const idnAccount = identity.accounts!.find(
                            (x) => x.source!.name === 'IdentityNow' || (x.source && x.source.name === 'IdentityNow')
                        ) as BaseAccount
                        await client.enableAccount(idnAccount.id!)
                        await sleep(5000)
                        const account = await getAccount(input.identity)
                        logger.info(account)
                        res.send(account)
                    } else {
                        throw new Error(NOTFOUND_ERROR)
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        logger.error(e.message)
                        errors.push(e.message)
                    }
                }

                if (errors.length > 0) {
                    await logErrors(workflow, context, input, errors)
                }

                if (!identity) {
                    throw new Error(NOTFOUND_ERROR)
                }
            }
        )
        .stdAccountDiscoverSchema(
            async (context: Context, input: undefined, res: Response<StdAccountDiscoverSchemaOutput>) => {
                const schema: any = {
                    attributes: [
                        {
                            name: 'id',
                            type: 'string',
                            description: 'ID',
                        },
                        {
                            name: 'uid',
                            type: 'string',
                            description: 'UID',
                        },
                        {
                            name: 'firstName',
                            type: 'string',
                            description: 'First name',
                        },
                        {
                            name: 'lastName',
                            type: 'string',
                            description: 'Last name',
                        },
                        {
                            name: 'displayName',
                            type: 'string',
                            description: 'Display name',
                        },
                    ],
                    displayAttribute: 'uid',
                    identityAttribute: 'id',
                }

                if (enableLevels) {
                    schema.attributes.push({
                        name: 'levels',
                        type: 'string',
                        description: 'User levels',
                        multi: true,
                        entitlement: true,
                        managed: true,
                        schemaObjectType: 'level',
                    })
                }

                if (enableWorkgroups) {
                    schema.attributes.push({
                        name: 'workgroups',
                        type: 'string',
                        description: 'Governance groups',
                        multi: true,
                        entitlement: true,
                        managed: true,
                        schemaObjectType: 'workgroup',
                    })
                }

                if (enableLCS) {
                    schema.attributes.push({
                        name: 'lcs',
                        type: 'string',
                        description: 'Lifecycle state',
                        multi: false,
                        entitlement: true,
                        managed: true,
                        schemaObjectType: 'lcs',
                    })
                }

                logger.info(schema)
                res.send(schema)
            }
        )
}
function jwt_decode(arg0: string): any {
    throw new Error('Function not implemented.')
}
