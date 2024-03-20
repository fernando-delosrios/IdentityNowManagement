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
    StdTestConnectionInput,
} from '@sailpoint/connector-sdk'
import { AccountResponse } from './model/account'
import { Level } from './model/level'
import { Workgroup } from './model/workgroup'
import { levels } from './data/levels'
import { LCS, LCSSource } from './model/lcs'
import { SDKClient } from './sdk-client'
import { jwtDecode } from 'jwt-decode'
import {
    BaseAccount,
    IdentityBeta,
    IdentityDocument,
    ListWorkgroupMembers200ResponseInnerBeta,
    OwnerDto,
    WorkflowBeta,
    WorkgroupDtoBeta,
} from 'sailpoint-api-client'

import { EmailWorkflow } from './model/emailWorkflow'
import { ErrorEmail } from './model/email'

const WORKFLOW_NAME = 'IdentityNow Management - Email sender'
const PROVISIONING_SLEEP = 5000

type WorkgroupWithMembers = WorkgroupDtoBeta & {
    members: ListWorkgroupMembers200ResponseInnerBeta[]
}

const sleep = (ms: number) => {
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

const lm = (message: string, component?: string, indentations?: number): string => {
    const PADDING = '   '
    indentations = indentations || 0

    let output = ''
    for (let index = 0; index < indentations; index++) {
        output += PADDING
    }
    if (component) {
        output += `${component}: `
    }
    output += message

    return output
}

// Connector must be exported as module property named connector
export const connector = async () => {
    const getWorkgroupEntitlements = async (): Promise<Workgroup[]> => {
        const c = 'getWorkgroupEntitlements'
        const entitlements: Workgroup[] = []
        logger.info(lm('Fetching governance groups', c, 1))
        const workgroups = await client.listWorkgroups()
        for (const w of workgroups) {
            logger.info(lm(`Building governance group ${w.name} object`, c, 2))
            entitlements.push(new Workgroup(w))
        }

        return entitlements
    }

    const getLCSEntitlements = async (): Promise<LCS[]> => {
        const c = 'getLCSEntitlements'
        const entitlements: LCS[] = []
        logger.info(lm('Fetching identity profiles', c, 1))
        const identityProfiles = await client.listIdentityProfiles()
        for (const ip of identityProfiles) {
            logger.info(lm(`Processing ${ip.name}. Fetching lifecycle states`, c, 2))
            const states = await client.listLifecycleStates(ip.id as string)
            for (const s of states) {
                logger.info(lm(`Processing ${s.name}`, c, 3))
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
        const c = 'getWorkgroupsWithMembers'
        const workgroups: WorkgroupWithMembers[] = []
        logger.info(lm('Fetching governance groups', c, 1))
        const wgs = await client.listWorkgroups()

        for (const w of wgs) {
            logger.info(lm(`Processing ${w.name}`, c, 2))
            const members = await client.listWorkgroupMembers(w.id as string)
            const workgroup = { ...w, members } as WorkgroupWithMembers
            workgroups.push(workgroup)
        }

        return workgroups
    }

    const getAssignedWorkgroups = async (id: string, groups?: WorkgroupWithMembers[]): Promise<string[]> => {
        const c = 'getAssignedWorkgroups'
        logger.info(lm('Fetching workgroups', c, 1))
        let workgroups: WorkgroupWithMembers[]
        if (groups) {
            workgroups = groups
        } else {
            workgroups = await getWorkgroupsWithMembers()
        }
        const assignedWorkgroups = workgroups.filter((w) => w.members.find((a) => a.id == id)).map((w) => w.id!)

        if (assignedWorkgroups.length === 0) {
            logger.info(lm(`No workgroups found`, c, 1))
        }

        return assignedWorkgroups
    }

    const getAssignedLevels = async (id: string, privilegedUsers?: IdentityDocument[]): Promise<string[]> => {
        const c = 'getAssignedLevels'

        logger.info(lm('Fetching levels', c, 1))
        let levels: string[]
        let accounts: BaseAccount[]

        if (privilegedUsers) {
            logger.info(lm('Privileged identities provided', c, 1))
            const privilegedUser = privilegedUsers.find((x) => x.id === id)
            if (privilegedUser) {
                logger.info(lm(`Privileged identity ${privilegedUser.name} found`, c, 1))
                accounts = privilegedUser.accounts as BaseAccount[]
                const idnAccount = findIDNAccount(accounts)
                if (
                    !(idnAccount && idnAccount.entitlementAttributes && idnAccount.entitlementAttributes.assignedGroups)
                ) {
                    //This must be a bug of some sort, perhaps it just takes time for IdentityNow source accounts to be fully updated with entitlements
                    accounts = (await client.listAccountsByIdentity(id)).map((x) => ({
                        source: {
                            id: x.sourceId,
                            name: x.sourceName,
                        },
                        entitlementAttributes: x.attributes,
                    }))
                }
            } else {
                accounts = []
            }
        } else {
            logger.info(lm('Fetching privileged identities', c, 1))
            accounts = (await client.listAccountsByIdentity(id)).map((x) => ({
                source: {
                    id: x.sourceId,
                    name: x.sourceName,
                },
                entitlementAttributes: x.attributes,
            }))
        }

        const idnAccount = findIDNAccount(accounts)
        if (idnAccount) {
            const attributes = idnAccount.entitlementAttributes
            levels = safeList(attributes ? attributes.assignedGroups : undefined)
        } else {
            logger.info(lm('No IdentityNow account found', c, 1))
            levels = []
        }

        return levels
    }

    const getAssignedLCS = async (rawAccount: IdentityBeta): Promise<string | null> => {
        const c = 'getAssignedLCS'
        let lcs: string | null = null
        if (rawAccount.lifecycleState && rawAccount.lifecycleState.manuallyUpdated) {
            logger.info(lm('LCS found', c, 1))
            lcs = await getLCSByName(
                rawAccount.lifecycleState.stateName,
                (rawAccount.attributes as any).cloudAuthoritativeSource
            )
        } else {
            logger.info(lm('LCS not found or automatically set', c, 1))
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
        const c = 'isValidLCS'
        let found = false
        logger.info(lm('Fetching identity profiles', c, 1))
        const identityProfiles = await client.listIdentityProfiles()
        const identityProfile = identityProfiles.find((x) => x.authoritativeSource.id === source)
        if (identityProfile) {
            logger.info(lm(`Identity profile ${identityProfile.name} found`, c, 1))
            logger.info(lm('Fetching lifecycle states for profile', c, 1))
            const states = await client.listLifecycleStates(identityProfile.id as string)
            found = states.find((x) => x.id === lcsID) ? true : false
        } else {
            logger.info(lm(`No identity profile found for source ${source}`, c, 1))
        }

        logger.info(lm(`Lifecycle state is ${found ? '' : 'not '}valid`, c, 1))

        return found
    }

    const buildAccount = async (
        rawAccount: IdentityBeta,
        workgroups?: any[],
        privilegedUsers?: IdentityDocument[]
    ): Promise<AccountResponse> => {
        const c = 'buildAccount'
        const uid = (rawAccount.attributes as any).uid
        logger.info(lm(`Building account with uid ${uid}`, c, 1))
        const account: AccountResponse = new AccountResponse(rawAccount)

        if (enableLevels) {
            logger.info(lm('Processing levels', c, 1))
            account.attributes.levels = await getAssignedLevels(account.identity, privilegedUsers)
        }

        if (enableWorkgroups) {
            logger.info(lm('Processing governance groups', c, 1))
            account.attributes.workgroups = await getAssignedWorkgroups(account.identity, workgroups)
        }

        if (enableLCS) {
            logger.info(lm('Processing lifecycle states', c, 1))
            account.attributes.lcs = await getAssignedLCS(rawAccount)
        }

        return account
    }

    const provisionWorkgroups = async (action: AttributeChangeOp, id: string, workgroups: string[]) => {
        const c = 'provisionWorkgroups'
        for (const workgroup of workgroups) {
            logger.info(lm(`Executing ${action} operation for ${id}/${workgroup}`, c, 1))
            if (action === AttributeChangeOp.Add) {
                await client.addWorkgroup(id, workgroup)
            } else if (action === AttributeChangeOp.Remove) {
                await client.removeWorkgroup(id, workgroup)
            }
        }
    }

    const provisionLevels = async (action: AttributeChangeOp, id: string, levels: string[]) => {
        const c = 'provisionLevels'
        logger.info(lm(`Executing ${action} operation for ${id}/${levels}`, c, 1))
        logger.info(lm('Fetching capabilities', c, 1))
        const capabilities = await client.getCapabilities(id)
        let resultingRoles: string[] = []
        if (action === AttributeChangeOp.Add) {
            resultingRoles = Array.from(new Set([...levels, ...capabilities]))
        } else if (action === AttributeChangeOp.Remove) {
            resultingRoles = capabilities.filter((x) => !levels.includes(x))
        }

        logger.info(lm('Setting capabilities', c, 1))
        await client.setCapabilities(id, resultingRoles)
    }

    const provisionLCS = async (action: AttributeChangeOp, id: string, lcs: string) => {
        const c = 'provisionLCS'
        logger.info(lm(`Executing ${action} operation for ${id}/${lcs}`, c, 1))

        if (action === AttributeChangeOp.Remove) {
            logger.info(lm('Ignoring LCS removal request', c, 1))
        } else {
            logger.info(lm(`Setting lifecycle state ${lcs}`, c, 1))
            await client.setLifecycleState(id, lcs)
        }
    }

    const getAccount = async (id: string): Promise<AccountResponse> => {
        const c = 'getAccount'
        logger.info(lm(`Getting details for account ID ${id}`, c, 1))
        const rawAccount = await client.getAccountDetails(id)
        const account = await buildAccount(rawAccount)
        return account
    }

    const getWorkflow = async (name: string): Promise<WorkflowBeta | undefined> => {
        const c = 'getWorkflow'
        const workflows = await client.listWorkflows()
        const workflow = workflows.find((x) => x.name === name)

        logger.info(lm(`Workflow ${workflow ? '' : 'not '}found`, c, 1))

        return workflow
    }

    const findIDNAccount = (accounts: BaseAccount[]): BaseAccount | undefined => {
        const idnAccount = accounts.find((x) => x.source && x.source.name === 'IdentityNow')

        return idnAccount
    }

    const logErrors = async (workflow: WorkflowBeta | undefined, context: Context, input: any, errors: string[]) => {
        if (errors.length > 0) {
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
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Get connector source config
    logger.info('Reading config')
    const config = await readConfig()
    const { enableLevels, enableWorkgroups, enableLCS, enableReports, allIdentities } = config
    logger.info('Instantiating SDK client')
    const client = new SDKClient(config)

    logger.info('Fetching access token')
    const accessToken = await client.config.accessToken
    if (!accessToken) {
        throw new Error('Check your connection details. Failed to get access token.')
    }
    let workflow: WorkflowBeta | undefined
    if (enableReports) {
        logger.info('Fetching email workflow')
        workflow = await getWorkflow(WORKFLOW_NAME)
        if (workflow) {
            logger.info('Email workflow already present')
        } else {
            logger.info('Creating email workflow')
            const jwt = jwtDecode(accessToken as string) as any
            const identityId = jwt.identity_id
            const owner: OwnerDto = {
                id: identityId,
                type: 'IDENTITY',
            }
            const emailWorkflow = new EmailWorkflow(WORKFLOW_NAME, owner)
            await client.createWorkflow(emailWorkflow)
        }
    }

    return createConnector()
        .stdTestConnection(
            async (context: Context, input: StdTestConnectionInput, res: Response<StdTestConnectionOutput>) => {
                logger.info('Test successful!')
                res.send({})
            }
        )
        .stdAccountList(async (context: Context, input: StdAccountListInput, res: Response<StdAccountListOutput>) => {
            const errors: string[] = []

            try {
                let groups: WorkgroupWithMembers[] = []
                if (enableWorkgroups) {
                    logger.info('Collecting governance groups with membership')
                    groups = await getWorkgroupsWithMembers()
                }
                let privilegedUsers: IdentityDocument[] = []
                if (enableLevels) {
                    logger.info('Collecting privileged identities')
                    privilegedUsers = await client.listPrivilegedIdentities()
                }

                logger.info('Collecting all identities')
                const identities = await client.listIdentities()

                for (const identity of identities) {
                    logger.info(`Processing ${identity.name}`)
                    const account = await buildAccount(identity, groups, privilegedUsers)
                    const levels = account.attributes.levels as string[]
                    const workgroups = account.attributes.workgroups as string[]
                    const lcs = account.attributes.lcs as string | null
                    if (
                        allIdentities ||
                        (enableLevels && levels.length > 0) ||
                        (enableWorkgroups && workgroups.length > 0) ||
                        (enableLCS && lcs)
                    ) {
                        logger.info(account)
                        res.send(account)
                    } else {
                        logger.info(lm(`Discarding ${identity.name}`, undefined, 1))
                    }
                }
            } catch (e) {
                if (e instanceof Error) {
                    logger.error(e.message)
                    errors.push(e.message)
                }
            }

            if (enableReports) {
                await logErrors(workflow, context, input, errors)
            }
        })
        .stdAccountRead(async (context: Context, input: StdAccountReadInput, res: Response<StdAccountReadOutput>) => {
            const c = 'stdAccountRead'
            const errors: string[] = []

            let account: AccountResponse | undefined
            logger.info(input)
            try {
                logger.info(lm(`Fetching ${input.identity} account`, c))
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

            if (enableReports) {
                await logErrors(workflow, context, input, errors)
            }
        })
        .stdEntitlementList(
            async (context: Context, input: StdEntitlementListInput, res: Response<StdEntitlementListOutput>) => {
                const c = 'stdEntitlementList'
                const errors: string[] = []

                try {
                    logger.info(input)
                    let entitlements: StdEntitlementListOutput[] = []
                    switch (input.type) {
                        case 'level':
                            if (enableLevels) {
                                logger.info(lm('Fetching level entitlements', c))
                                entitlements = getLevelEntitlements()
                            }
                            break

                        case 'workgroup':
                            if (enableWorkgroups) {
                                logger.info(lm('Fetching workgroup entitlements', c))
                                entitlements = await getWorkgroupEntitlements()
                            }
                            break

                        case 'lcs':
                            if (enableLCS) {
                                logger.info(lm('Fetching lcs entitlements', c))
                                entitlements = await getLCSEntitlements()
                            }
                            break

                        default:
                            const message = `Unsupported entitlement type ${input.type}`
                            throw new ConnectorError(message)
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

                if (enableReports) {
                    await logErrors(workflow, context, input, errors)
                }
            }
        )
        .stdEntitlementRead(
            async (context: Context, input: StdEntitlementReadInput, res: Response<StdEntitlementReadOutput>) => {
                const c = 'stdEntitlementRead'
                const errors: string[] = []

                try {
                    logger.info(input)
                    let entitlement: StdEntitlementReadOutput | undefined

                    switch (input.type) {
                        case 'level':
                            logger.info(`Fetching ${input.identity} ${input.type} entitlement`, c)
                            entitlement = getLevelEntitlements().find((x) => input.identity === x.identity)
                            break

                        case 'workgroup':
                            logger.info(`Fetching ${input.identity} ${input.type} entitlement`, c)
                            const workgroup = await client.getWorkgroup(input.identity)
                            entitlement = new Workgroup(workgroup)
                            break

                        case 'lcs':
                            logger.info(`Fetching ${input.identity} ${input.type} entitlement`, c)
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

                if (enableReports) {
                    await logErrors(workflow, context, input, errors)
                }
            }
        )
        .stdAccountCreate(
            async (context: Context, input: StdAccountCreateInput, res: Response<StdAccountCreateOutput>) => {
                const c = 'stdAccountCreate'
                const errors: string[] = []

                try {
                    logger.info(input)
                    logger.info(lm(`Fetching identity with UID ${input.attributes.uid}`, c))
                    const rawAccount = await client.getIdentityByUID(input.attributes.uid as string)
                    if (rawAccount) {
                        if ('levels' in input.attributes) {
                            logger.info(lm('Processing levels', c))
                            const levels = [].concat(input.attributes.levels)
                            await provisionLevels(AttributeChangeOp.Add, rawAccount.id!, levels)
                        }

                        if ('workgroups' in input.attributes) {
                            logger.info(lm('Processing governance groups', c))
                            const workgroups = [].concat(input.attributes.workgroups)
                            await provisionWorkgroups(AttributeChangeOp.Add, rawAccount.id!, workgroups)
                        }

                        if ('lcs' in input.attributes) {
                            logger.info(lm('Processing lifecycle states', c))
                            const cloudAuthoritativeSource = (rawAccount.attributes as any).cloudAuthoritativeSource
                            if (await isValidLCS(input.attributes.lcs, cloudAuthoritativeSource!)) {
                                await provisionLCS(AttributeChangeOp.Add, rawAccount.id as string, input.attributes.lcs)
                            } else {
                                logger.info(`Invalid lcs ${input.attributes.lcs}. Skipping.`)
                            }
                        }

                        const account = await getAccount(rawAccount.id!)

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

                if (enableReports) {
                    await logErrors(workflow, context, input, errors)
                }
            }
        )
        .stdAccountUpdate(
            async (context: Context, input: StdAccountUpdateInput, res: Response<StdAccountUpdateOutput>) => {
                const c = 'stdAccountUpdate'
                const errors: string[] = []

                try {
                    logger.info(input)
                    logger.info(lm(`Updating ${input.identity} account`, c))

                    if (input.changes) {
                        for (const change of input.changes) {
                            switch (change.attribute) {
                                case 'levels':
                                    logger.info(lm('Processing levels', c))
                                    const levels = [].concat(change.value)
                                    await provisionLevels(change.op, input.identity, levels)
                                    break
                                case 'workgroups':
                                    logger.info(lm('Processing workgroups', c))
                                    const workgroups = [].concat(change.value)
                                    await provisionWorkgroups(change.op, input.identity, workgroups)
                                    break
                                case 'lcs':
                                    logger.info(lm('Processing lcs', c))
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
                        await sleep(PROVISIONING_SLEEP)
                        //Need to investigate about std:account:update operations without changes but adding this for the moment
                    } else if ('attributes' in input) {
                        logger.warn(
                            lm(
                                'No changes detected in account update. Please report unless you used attribute sync which is not supported.',
                                c
                            )
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

                if (enableReports) {
                    await logErrors(workflow, context, input, errors)
                }
            }
        )
        .stdAccountDisable(
            async (context: Context, input: StdAccountDisableInput, res: Response<StdAccountDisableOutput>) => {
                const c = 'stdAccountDisable'
                const errors: string[] = []
                let identity: IdentityDocument | undefined
                try {
                    logger.info(input)

                    logger.info(lm(`Fetching ${input.identity} identity`, c))
                    identity = await client.getIdentity(input.identity)
                    if (identity) {
                        let account = await getAccount(input.identity)
                        const idnAccount = findIDNAccount(identity.accounts!)

                        if (idnAccount) {
                            logger.info(lm(`Disabling ${input.identity} account`, c))
                            await client.disableAccount(idnAccount.id!)
                            await sleep(PROVISIONING_SLEEP)

                            //Leaving this in place for whoever wants to maintain this convenience option
                            // if (removeGroups) {
                            //     const levels = (account.attributes.levels as string[]) || []
                            //     await provisionLevels(AttributeChangeOp.Remove, input.identity, levels)
                            //     const workgroups = (account.attributes.workgroups as string[]) || []
                            //     await provisionWorkgroups(AttributeChangeOp.Remove, input.identity, workgroups)
                            //     await sleep(PROVISIONING_SLEEP)
                            // }
                            account = await getAccount(input.identity)

                            logger.info(account)
                            res.send(account)
                        } else {
                            throw new Error('IdentityNow account not found')
                        }
                    } else {
                        throw new Error('Identity not found')
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        logger.error(e.message)
                        errors.push(e.message)
                        if (enableReports) {
                            await logErrors(workflow, context, input, errors)
                        }
                    }
                    throw e
                }
            }
        )

        .stdAccountEnable(
            async (context: Context, input: StdAccountEnableInput, res: Response<StdAccountEnableOutput>) => {
                const c = 'stdAccountEnable'
                const errors: string[] = []
                let identity: IdentityDocument | undefined

                try {
                    logger.info(input)

                    identity = await client.getIdentity(input.identity)
                    if (identity) {
                        const idnAccount = findIDNAccount(identity.accounts!)

                        if (idnAccount) {
                            logger.info(lm(`Enabling ${input.identity} account`, c))
                            await client.enableAccount(idnAccount.id!)
                            await sleep(PROVISIONING_SLEEP)
                            const account = await getAccount(input.identity)
                            logger.info(account)
                            res.send(account)
                        } else {
                            throw new Error('IdentityNow account not found')
                        }
                    } else {
                        throw new Error('Identity not found')
                    }
                } catch (e) {
                    if (e instanceof Error) {
                        logger.error(e.message)
                        errors.push(e.message)
                        if (enableReports) {
                            await logErrors(workflow, context, input, errors)
                        }
                    }
                    throw e
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
