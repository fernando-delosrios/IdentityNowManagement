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

// Connector must be exported as module property named connector
export const connector = async () => {
    // Get connector source config
    const config = await readConfig()
    const removeGroups = config.removeGroups
    const includeWorkgroups = config.includeWorkgroups

    // Use the vendor SDK, or implement own client as necessary, to initialize a client
    const client = new IDNClient(config)

    const SLEEP: number = 2000
    const workgroupRegex = /.+-.+-.+-.+-.+/
    const EXCLUDED_ROLES = ['AUDITOR', 'DASHBOARD']

    function sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms))
    }

    const getWorkgroups = async (): Promise<any> => {
        const workgroups: any[] = []
        if (includeWorkgroups) {
            const response1 = await client.workgroupAggregation()
            for (const workgroup of response1.data) {
                const response2 = await client.getWorkgroupDetails(workgroup.id)
                workgroup.members = response2.data
                workgroups.push(workgroup)
            }
        }
        return workgroups
    }

    const buildAccount = async (id: string, workgroups: any[]): Promise<Account> => {
        const response: AxiosResponse = await client.getAccountDetails(id)
        const account: Account = new Account(response.data)
        const assignedWorkgroups =
            workgroups.filter((w) =>
                w.members.find((a: { externalId: number }) => a.externalId == account.attributes.externalId)
            ) || []
        const roles: string[] = await client.getCapabilties(account.attributes.externalId as string) || []
        account.attributes.groups = [...roles, ...assignedWorkgroups.map((w) => w.id)]

        return account
    }

    const provisionEntitlement = async (action: AttributeChangeOp, account: Account, entitlement: string) => {
        logger.info(`Governance Group| Executing ${action} operation for ${account.uuid}/${entitlement}`)

        if (action === AttributeChangeOp.Add) {
            await client.addWorkgroup(account.attributes.externalId as string, entitlement)
        } else if (action === AttributeChangeOp.Remove) {
            await client.removeWorkgroup(account.attributes.externalId as string, entitlement)
        }
    }

    const provisionPermission = async (action: AttributeChangeOp, account: Account, entitlements: string[]) => {
        logger.info(`Roles| Executing ${action} operation for ${account.uuid}/${entitlements}`)
        if (action === AttributeChangeOp.Add) {
            const capabilities: string[] = (await client.getCapabilties(account.attributes.externalId as string)) || []
            for (const capability of entitlements) {
                capabilities.push(capability)
            }
            await client.addRole(account.attributes.externalId as string, capabilities)
        } else if (action === AttributeChangeOp.Remove) {
            const capabilities: string[] = (await client.getCapabilties(account.attributes.externalId as string)) || []
            let updatedCapabilities: string[] = capabilities
            for (const capability of entitlements) {
                updatedCapabilities = updatedCapabilities.filter((cap) => cap !== capability)
            }
            await client.removeRole(account.attributes.externalId as string, updatedCapabilities)
        }
    }

    const removeAll = async (account: Account, groups: any) => {
        const rolesToRemove: string[] = []
        if (groups) {
            let roles: string[] = []
            if (Array.isArray(groups)) {
                roles = groups
            } else {
                roles.push(groups)
            }
            console.log(roles)
            for (const group of roles) {
                if (workgroupRegex.test(group)) {
                    await provisionEntitlement(AttributeChangeOp.Remove, account, group)
                } else {
                    rolesToRemove.push(group)
                }
            }
            if (rolesToRemove) {
                await provisionPermission(AttributeChangeOp.Remove, account, rolesToRemove)
            }
        }
    }

    const getLifecycle = async (id: any) => {
        return await client.getLCS(id)
    }

    return createConnector()
        .stdTestConnection(async (context: Context, input: undefined, res: Response<StdTestConnectionOutput>) => {
            const response: AxiosResponse = await client.testConnection()
            const response1 = await client.obtainAccessToken()
            if (response.status != 200 || typeof response1 !== 'string') {
                throw new ConnectorError('Unable to connect to IdentityNow! Please check your Username and Password')
            } else {
                logger.info('Test successful!')
                res.send({})
            }
        })
        .stdAccountList(async (context: Context, input: StdAccountListInput, res: Response<StdAccountListOutput>) => {
            const response: AxiosResponse = await client.accountAggregation()
            const workgroups: any[] = await getWorkgroups()
            const accounts = new Set<string>(response.data.map((a: { name: string }) => a.name))
            workgroups.forEach((w) => w.members.forEach((x: { alias: string }) => accounts.add(x.alias)))
            for (const id of Array.from(accounts)) {
                const account: Account = await buildAccount(id, workgroups)

                logger.info(account)
                res.send(account)
            }
        })
        .stdAccountRead(async (context: Context, input: StdAccountReadInput, res: Response<StdAccountReadOutput>) => {
            logger.info(input)
            const workgroups: any[] = await getWorkgroups()
            const account: Account = await buildAccount(input.identity, workgroups)

            logger.info(account)
            res.send(account)
        })
        .stdEntitlementList(async (context: Context, input: any, res: Response<StdEntitlementListOutput>) => {
            const response1: AxiosResponse = await client.roleAggregation()
            for (const r of response1.data) {
                if (!EXCLUDED_ROLES.includes(r.value)) {
                    const role: Role = new Role(r)

                    logger.info(role)
                    res.send(role)
                }
            }
            if (includeWorkgroups) {
                const response2: AxiosResponse = await client.workgroupAggregation()
                for (const w of response2.data) {
                    const workgroup: Workgroup = new Workgroup(w)

                    logger.info(workgroup)
                    res.send(workgroup)
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
                    const response: AxiosResponse = await client.getRoleDetails(input.identity)
                    const role: Role = new Role(response.data.pop())

                    logger.info(role)
                    res.send(role)
                }
            }
        )
        .stdAccountCreate(
            async (context: Context, input: StdAccountCreateInput, res: Response<StdAccountCreateOutput>) => {
                logger.info(input)
                const response1 = await client.getAccountDetailsByName(input.attributes.name as string)
                const rawAccount = response1.data.pop()
                const response2 = await client.getAccountDetails(rawAccount.name)
                let account: Account = new Account(response2.data)
                if (input.attributes.groups != null) {
                    let values: string[] = [].concat(input.attributes.groups)
                    let roles: string[] = values
                    for (const value of values) {
                        if (workgroupRegex.test(value)) {
                            await provisionEntitlement(AttributeChangeOp.Add, account, value)
                            roles = roles.filter((cap) => cap !== value)
                        }
                    }
                    await provisionPermission(AttributeChangeOp.Add, account, roles)
                }
                const workgroups: any[] = await getWorkgroups()
                account = await buildAccount(rawAccount.name as string, workgroups)

                logger.info(account)
                res.send(account)
            }
        )
        .stdAccountUpdate(
            async (context: Context, input: StdAccountUpdateInput, res: Response<StdAccountUpdateOutput>) => {
                logger.info(input)
                const response = await client.getAccountDetails(input.identity)
                let account: Account = new Account(response.data)
                for (const change of input.changes) {
                    const values: string[] = [].concat(change.value)
                    let roles: string[] = values
                    if (change.op === AttributeChangeOp.Set) {
                        throw new ConnectorError(`Operation not supported: ${change.op}`)
                    } else {
                        for (const value of values) {
                            if (workgroupRegex.test(value)) {
                                await provisionEntitlement(change.op, account, value)
                                roles = roles.filter((cap) => cap !== value)
                            }
                        }
                        await provisionPermission(change.op, account, roles)
                    }
                }

                const workgroups: any[] = await getWorkgroups()
                account = await buildAccount(input.identity, workgroups)

                logger.info(account)
                res.send(account)
            }
        )
        .stdAccountDisable(async (context: Context, input: any, res: Response<any>) => {
            logger.info(input)
            const workgroups: any[] = await getWorkgroups()
            const account: Account = await buildAccount(input.identity, workgroups)
            const groups = (account.attributes.groups as string) || []
            if (removeGroups && Array.isArray(groups) && groups.length > 0) {
                const LCS: any = await getLifecycle(account.attributes.externalId)
                if (typeof LCS === 'string' && LCS.toLowerCase() === 'inactive') {
                    removeAll(account, groups)
                    account.attributes.groups = []
                }
            }
            account.attributes.enabled = false
            logger.info(account)
            res.send(account)
            await sleep(SLEEP)
            await client.disableAccount(account.attributes.externalId as string)
        })

        .stdAccountEnable(async (context: Context, input: any, res: Response<any>) => {
            logger.info(input)
            const workgroups: any[] = await getWorkgroups()
            const account: Account = await buildAccount(input.identity, workgroups)

            account.attributes.enabled = true
            logger.info(account)
            res.send(account)
            await sleep(SLEEP)
            await client.enableAccount(account.attributes.externalId as string)
        })
}
