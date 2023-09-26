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
} from '@sailpoint/connector-sdk'
import { AxiosResponse } from 'axios'
import { IDNClient } from './idn-client'
import { Account } from './model/account'
import { Role } from './model/role'
import { Workgroup } from './model/workgroup'

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

// Connector must be exported as module property named connector
export const connector = async () => {
    // Get connector source config
    const config = await readConfig()
    const removeGroups = config.removeGroups
    const includeWorkgroups = config.includeWorkgroups

    // Use the vendor SDK, or implement own client as necessary, to initialize a client
    const client = new IDNClient(config)

    const workgroupRegex = /.+-.+-.+-.+-.+/
    // const EXCLUDED_ROLES = ['AUDITOR', 'DASHBOARD']

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

    const getRoles = () => {
        return [
            { name: 'Helpdesk', value: 'HELPDESK', description: 'Helpdesk access to IdentityNow' },
            { name: 'Administrator', value: 'ORG_ADMIN', description: 'Full administrative access to IdentityNow' },
            {
                name: 'Cert Administrator',
                value: 'CERT_ADMIN',
                description: 'Cert Administrator access to IdentityNow',
            },
            {
                name: 'Report Administrator',
                value: 'REPORT_ADMIN',
                description: 'Report Administrator access to IdentityNow',
            },
            {
                name: 'Role Administrator',
                value: 'ROLE_ADMIN',
                description: 'Role Administrator access to IdentityNow',
            },
            {
                name: 'Role SubAdministrator',
                value: 'ROLE_SUBADMIN',
                description: 'Role SubAdministrator access to IdentityNow',
            },
            {
                name: 'Source Administrator',
                value: 'SOURCE_ADMIN',
                description: 'Source Administrator access to IdentityNow',
            },
            {
                name: 'Source Subadministrator',
                value: 'SOURCE_SUBADMIN',
                description: 'Source Subadministrator access to IdentityNow',
            },
            {
                name: 'Cloud Gov Admin',
                value: 'CLOUD_GOV_ADMIN',
                description: 'Cloud Gov Admin access to IdentityNow',
            },
            {
                name: 'Cloud Gov User',
                value: 'CLOUD_GOV_USER',
                description: 'Cloud Gov User access to IdentityNow',
            },
            {
                name: 'Access Intelligence Center - Reader',
                value: 'sp:aic-dashboard-read',
                description: 'Access Intelligence Center - Reader access to IdentityNow',
            },
            {
                name: 'Access Intelligence Center - Author',
                value: 'sp:aic-dashboard-write',
                description: 'Access Intelligence Center - Author access to IdentityNow',
            },
            {
                name: 'Access Intelligence Center - Admin',
                value: 'sp:aic-dashboard-admin',
                description: 'Access Intelligence Center - Admin access to IdentityNow',
            },
            {
                name: 'Cloud Governance - Admin',
                value: 'CLOUD_GOV_ADMIN',
                description: 'Admin access to Cloud Governance',
            },
            {
                name: 'Cloud Governance - User',
                value: 'CLOUD_GOV_USER',
                description: 'User access to Cloud Governance',
            },
            {
                name: 'SaaS Management - Admin',
                value: 'SAAS_MANAGEMENT_ADMIN',
                description: 'Admin access to SaaS Management',
            },
            {
                name: 'SaaS Management - Reader',
                value: 'SAAS_MANAGEMENT_READER',
                description: 'Reader access to SaaS Management',
            },
            {
                name: 'User',
                value: 'user',
                description:
                    'User access to IdentityNow. No special permission, it just enables the identity to be managed in a JML flow',
            },
        ]
    }

    const getWorkgroups = async (): Promise<any> => {
        const workgroups: any[] = []
        if (includeWorkgroups) {
            for await (const response1 of client.workgroupAggregation()) {
                for (const workgroup of response1.data) {
                    const response2 = await client.getWorkgroupMembership(workgroup.id)
                    workgroup.members = response2.data
                    workgroups.push(workgroup)
                }
            }
        }
        return workgroups
    }

    const getAssignedRoles = (rawAccount: any): string[] => {
        let roles: string[]
        if (rawAccount.role !== undefined) {
            roles = safeList(rawAccount.role)
        } else {
            const idnAccount = rawAccount.accounts.find(
                (x: { source: { type: string } }) => x.source.type === 'IdentityNowConnector'
            )
            roles = safeList(idnAccount.entitlementAttributes.assignedGroups)
        }
        return roles
    }

    const buildAccount = async (rawAccount: any, workgroups: any[]): Promise<Account> => {
        const account: Account = new Account(rawAccount)
        const assignedWorkgroups =
            workgroups
                .filter((w) => w.members.find((a: { externalId: number }) => a.externalId == account.attributes.id))
                .map((w) => w.id) || []
        const assignedRoles = getAssignedRoles(rawAccount)
        account.attributes.groups = [...assignedRoles, ...assignedWorkgroups, 'user']

        return account
    }

    const provisionWorkgroup = async (action: AttributeChangeOp, id: string, entitlement: string) => {
        logger.info(`Governance Group| Executing ${action} operation for ${id}/${entitlement}`)

        if (action === AttributeChangeOp.Add) {
            await client.addWorkgroup(id, entitlement)
        } else if (action === AttributeChangeOp.Remove) {
            await client.removeWorkgroup(id, entitlement)
        }
    }

    const provisionRoles = async (action: AttributeChangeOp, id: string, roles: string[]) => {
        logger.info(`Roles| Executing ${action} operation for ${id}/${roles}`)
        const response = await client.getCapabilities(id)
        const capabilities: string[] = response.data.capabilities || []
        let resultingRoles: string[] = []
        if (action === AttributeChangeOp.Add) {
            resultingRoles = [...roles, ...capabilities]
        } else if (action === AttributeChangeOp.Remove) {
            resultingRoles = capabilities.filter((x) => !roles.includes(x))
        }
        await client.provisionRoles(id, resultingRoles)
    }

    const provisionEntitlements = async (action: AttributeChangeOp, id: string, groups: string[]) => {
        const roles: string[] = []
        for (const group of groups) {
            if (group) {
                if (workgroupRegex.test(group)) {
                    await provisionWorkgroup(action, id, group)
                } else if (group !== 'user') {
                    roles.push(group)
                }
            }
        }
        await provisionRoles(action, id, roles)
    }

    const getLCS = async (id: string) => {
        const response = await client.getLCS(id)
        return response.data.attributes.cloudLifecycleState
    }

    return createConnector()
        .stdTestConnection(async (context: Context, input: undefined, res: Response<StdTestConnectionOutput>) => {
            const response1: AxiosResponse = await client.testConnection()
            const response2 = await client.getOathkeeperToken()
            if (response1.status != 200 || typeof response2 !== 'string') {
                throw new ConnectorError('Unable to connect to IdentityNow! Please check your Username and Password')
            } else {
                logger.info('Test successful!')
                res.send({})
            }
        })
        .stdAccountList(async (context: Context, input: StdAccountListInput, res: Response<StdAccountListOutput>) => {
            const workgroups: any[] = await getWorkgroups()
            const workgroupMembers = new Set<string>()
            let rawAccounts: any[] = []
            for await (const response of client.accountAggregation()) {
                rawAccounts = rawAccounts.concat(response.data)
            }
            workgroups.forEach((w) => w.members.forEach((x: { alias: string }) => workgroupMembers.add(x.alias)))
            for (const member of workgroupMembers) {
                if (!rawAccounts.find((x) => x.name === member)) {
                    const response = await client.getAccountDetails(member)
                    rawAccounts.push(response.data)
                }
            }

            for (const rawAccount of rawAccounts) {
                buildAccount(rawAccount, workgroups)
                    .then((account) => {
                        logger.info(account)
                        res.send(account)
                    })
                    .catch(logger.error)
            }
        })
        .stdAccountRead(async (context: Context, input: StdAccountReadInput, res: Response<StdAccountReadOutput>) => {
            logger.info(input)
            const workgroups: any[] = await getWorkgroups()
            const response = await client.getAccountDetails(input.identity)
            const account: Account = await buildAccount(response.data, workgroups)

            logger.info(account)
            res.send(account)
        })
        .stdEntitlementList(async (context: Context, input: any, res: Response<StdEntitlementListOutput>) => {
            for (const r of getRoles()) {
                const role: Role = new Role(r)

                logger.info(role)
                res.send(role)
            }

            if (includeWorkgroups) {
                for await (const response of client.workgroupAggregation()) {
                    for (const w of response.data) {
                        const workgroup: Workgroup = new Workgroup(w)

                        logger.info(workgroup)
                        res.send(workgroup)
                    }
                }
            }
        })
        .stdEntitlementRead(
            async (context: Context, input: StdEntitlementReadInput, res: Response<StdEntitlementReadOutput>) => {
                logger.info(input)

                if (workgroupRegex.test(input.identity)) {
                    const response: AxiosResponse = await client.getWorkgroup(input.identity)
                    const workgroup: Workgroup = new Workgroup(response.data)

                    logger.info(workgroup)
                    res.send(workgroup)
                } else {
                    const response: AxiosResponse = await client.getRole(input.identity)
                    const role: Role = new Role(response.data)

                    logger.info(role)
                    res.send(role)
                }
            }
        )
        .stdAccountCreate(
            async (context: Context, input: StdAccountCreateInput, res: Response<StdAccountCreateOutput>) => {
                logger.info(input)
                const response1 = await client.getAccountDetails(input.identity as string)
                let rawAccount = response1.data
                const groups = [].concat(input.attributes.groups)
                await provisionEntitlements(AttributeChangeOp.Add, rawAccount.id, groups)

                const workgroups = await getWorkgroups()
                const response2 = await client.getAccountDetails(input.identity as string)
                rawAccount = response2.data
                const account = await buildAccount(rawAccount, workgroups)

                logger.info(account)
                res.send(account)
            }
        )
        .stdAccountUpdate(
            async (context: Context, input: StdAccountUpdateInput, res: Response<StdAccountUpdateOutput>) => {
                logger.info(input)
                const response1 = await client.getAccountDetails(input.identity)
                let rawAccount = response1.data
                if (input.changes) {
                    for (const change of input.changes) {
                        const groups: string[] = [].concat(change.value)
                        if (change.op === AttributeChangeOp.Set) {
                            throw new ConnectorError(`Operation not supported: ${change.op}`)
                        } else {
                            await provisionEntitlements(change.op, rawAccount.id, groups)
                        }
                    }
                    //Need to investigate about std:account:update operations without changes but adding this for the moment
                } else if ('attributes' in input) {
                    const groups = (input as any).attributes.groups || []
                    await provisionEntitlements(AttributeChangeOp.Add, rawAccount.id, groups)
                }

                const workgroups = await getWorkgroups()
                const response2 = await client.getAccountDetails(input.identity)
                rawAccount = response2.data
                const account = await buildAccount(rawAccount, workgroups)

                logger.info(account)
                res.send(account)
            }
        )
        .stdAccountDisable(async (context: Context, input: any, res: Response<any>) => {
            logger.info(input)
            const workgroups = await getWorkgroups()
            const response = await client.getAccountDetails(input.identity)
            const rawAccount = response.data
            const account = await buildAccount(response.data, workgroups)
            const groups = (account.attributes.groups as string[]) || []
            if (removeGroups && groups.length > 0) {
                const LCS = await getLCS(rawAccount.id)
                if (LCS.toLowerCase() === 'inactive') {
                    await provisionEntitlements(AttributeChangeOp.Remove, rawAccount.id, groups)
                    account.attributes.groups = []
                }
            }
            account.disabled = true

            //await sleep(5000)
            await client.disableAccount(account.attributes.id as string)
            logger.info(account)
            res.send(account)
        })

        .stdAccountEnable(async (context: Context, input: any, res: Response<any>) => {
            logger.info(input)
            const workgroups = await getWorkgroups()
            const response = await client.getAccountDetails(input.identity)
            const rawAccount = response.data
            const account = await buildAccount(rawAccount, workgroups)

            account.disabled = false

            await client.enableAccount(account.attributes.id as string)
            logger.info(account)
            res.send(account)
        })
}
