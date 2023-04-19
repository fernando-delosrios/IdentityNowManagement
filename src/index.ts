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
        const response1 = await client.workgroupAggregation()
        for (const workgroup of response1.data) {
            const response2 = await client.getWorkgroupDetails(workgroup.id)
            workgroup.members = response2.data
            workgroups.push(workgroup)
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
        const roles: string[] = account.attributes.groups as string[]
        account.attributes.groups = [...roles, ...assignedWorkgroups.map((w) => w.id)]

        return account
    }

    const provisionEntitlement = async (action: AttributeChangeOp, account: Account, entitlement: string) => {
        logger.info(`Executing ${action} operation for ${account.uuid}/${entitlement}`)
        if (workgroupRegex.test(entitlement)) {
            if (action === AttributeChangeOp.Add) {
                await client.addWorkgroup(account.attributes.externalId as string, entitlement)
            } else if (action === AttributeChangeOp.Remove) {
                await client.removeWorkgroup(account.attributes.externalId as string, entitlement)
            }
        } else {
            if (action === AttributeChangeOp.Add) {
                await client.addRole(account.attributes.id as string, entitlement)
            } else if (action === AttributeChangeOp.Remove) {
                await client.removeRole(account.attributes.id as string, entitlement)
            }
            //Looks like /cc/api/user/updatePermissions endpoint needs some cooldown before being called again or requests won't take effect
            await sleep(SLEEP)
        }
    }

    return createConnector()
        .stdTestConnection(async (context: Context, input: undefined, res: Response<StdTestConnectionOutput>) => {
            const response: AxiosResponse = await client.testConnection()
            if (response.status != 200) {
                throw new ConnectorError('Unable to connect to IdentityNow')
            } else {
                logger.info('Test successful!')
                res.send({})
            }
        })
        .stdAccountList(async (context: Context, input: undefined, res: Response<StdAccountListOutput>) => {
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
            const response2: AxiosResponse = await client.workgroupAggregation()
            for (const r of response1.data) {
                if (!EXCLUDED_ROLES.includes(r.value)) {
                    const role: Role = new Role(r)

                    logger.info(role)
                    res.send(role)
                }
            }
            for (const w of response2.data) {
                const workgroup: Workgroup = new Workgroup(w)

                logger.info(workgroup)
                res.send(workgroup)
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
                    let values: string[] = []
                        .concat(input.attributes.groups)
                        .map((x: string) => (x === 'ORG_ADMIN' ? 'ADMIN' : x))
                    for (let value of values) {
                        await provisionEntitlement(AttributeChangeOp.Add, account, value)
                    }
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
                    const values: string[] = []
                        .concat(change.value)
                        .map((x: string) => (x === 'ORG_ADMIN' ? 'ADMIN' : x))
                    if (change.op === AttributeChangeOp.Set) {
                        throw new ConnectorError(`Operation not supported: ${change.op}`)
                    } else {
                        for (const value of values) {
                            await provisionEntitlement(change.op, account, value)
                        }
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

            let retries = config.enableRetries
            while (retries > 0) {
                try {
                    const response = await client.disableAccount(account.attributes.externalId as string)
                    account.attributes.enabled = false
                    account.disabled = true

                    logger.info(account)
                    res.send(account)
                    break
                } catch (e) {
                    let message = ''
                    if (typeof e === 'string') {
                        message = e
                    } else if (e instanceof Error) {
                        message = e.message
                    }
                    retries--
                    const retries_left = config.enableRetries - retries
                    logger.info(`Retry ${retries_left}/${config.enableRetries} failed with error "${message}"`)
                    await sleep(SLEEP)
                }
            }
        })
        .stdAccountEnable(async (context: Context, input: any, res: Response<any>) => {
            logger.info(input)
            const workgroups: any[] = await getWorkgroups()
            const account: Account = await buildAccount(input.identity, workgroups)

            let retries = config.enableRetries
            while (retries > 0) {
                try {
                    const response = await client.enableAccount(account.attributes.externalId as string)
                    account.attributes.enabled = true
                    account.disabled = false

                    logger.info(account)
                    res.send(account)
                    break
                } catch (e) {
                    let message = ''
                    if (typeof e === 'string') {
                        message = e
                    } else if (e instanceof Error) {
                        message = e.message
                    }
                    retries--
                    const retries_left = config.enableRetries - retries
                    logger.info(`Retry ${retries_left}/${config.enableRetries} failed with error "${message}"`)
                    await sleep(SLEEP)
                }
            }
        })
}
