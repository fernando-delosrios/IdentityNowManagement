import { AxiosError, AxiosRequestConfig } from 'axios'
import axiosRetry from 'axios-retry'
import {
    IdentityDocument,
    Configuration,
    Paginator,
    Search,
    SearchApi,
    Account,
    IdentityProfilesBetaApi,
    GovernanceGroupsBetaApi,
    GovernanceGroupsBetaApiDeleteWorkgroupMembersRequest,
    GovernanceGroupsBetaApiUpdateWorkgroupMembersRequest,
    WorkgroupMemberAddItemBeta,
    WorkgroupMemberDeleteItemBeta,
    ListWorkgroupMembers200ResponseInnerBeta,
    WorkgroupDtoBeta,
    IdentityProfileBeta,
    IdentitiesBetaApi,
    IdentityBeta,
    WorkflowBeta,
    WorkflowsBetaApi,
    WorkflowsBetaApiCreateWorkflowRequest,
    TestWorkflowRequestBeta,
    IdentitiesBetaApiGetIdentityRequest,
    WorkflowsBetaApiTestWorkflowRequest,
    IdentitiesBetaApiListIdentitiesRequest,
} from 'sailpoint-api-client'
import {
    AccountsApi,
    AccountsApiDisableAccountRequest,
    AccountsApiEnableAccountRequest,
    AccountsApiListAccountsRequest,
    AccountsAsyncResult,
    AuthUser,
    AuthUserApi,
    AuthUserApiPatchAuthUserRequest,
    JsonPatchOperation,
    LifecycleState,
    LifecycleStatesApi,
    LifecycleStatesApiSetLifecycleStateRequest,
    SetLifecycleState200Response,
} from 'sailpoint-api-client/dist/v3'
import { URL } from 'url'

const TOKEN_URL_PATH = '/oauth/token'
const BATCH_SIZE = 15
const retries = 10

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

const retryCondition = (error: AxiosError): boolean => {
    return axiosRetry.isRetryableError(error) || (error.response ? error.response.status === 429 : false)
}

const retryDelay = (retryCount: number, error: AxiosError<unknown, any>, delayFactor?: number | undefined): number => {
    if (error.response && error.response.headers['retry-after']) {
        return error.response.headers['retry-after'] * 1000
    } else {
        return axiosRetry.exponentialDelay(retryCount, error, delayFactor)
    }
}

const axiosOptions: AxiosRequestConfig = {
    'axios-retry': {
        retries,
        retryDelay,
        retryCondition,
    },
}

export class SDKClient {
    config: Configuration

    constructor(config: any) {
        const tokenUrl = new URL(config.baseurl).origin + TOKEN_URL_PATH
        this.config = new Configuration({ ...config, tokenUrl })
        this.config.retriesConfig = axiosOptions['axios-retry']
    }

    async listWorkgroups(): Promise<WorkgroupDtoBeta[]> {
        const api = new GovernanceGroupsBetaApi(this.config)

        const response = await Paginator.paginate(api, api.listWorkgroups)

        return response.data
    }

    async listIdentityProfiles(): Promise<IdentityProfileBeta[]> {
        const api = new IdentityProfilesBetaApi(this.config)

        const response = await Paginator.paginate(api, api.listIdentityProfiles)

        return response.data
    }

    async listLifecycleStates(identityProfileId: string): Promise<LifecycleState[]> {
        const api = new LifecycleStatesApi(this.config)

        const response = await api.listLifecycleStates({ identityProfileId })

        return response.data
    }

    async listWorkgroupMembers(workgroupId: string): Promise<ListWorkgroupMembers200ResponseInnerBeta[]> {
        const api = new GovernanceGroupsBetaApi(this.config)
        const response = await api.listWorkgroupMembers({ workgroupId })

        return response.data
    }

    async listIdentities(): Promise<IdentityBeta[]> {
        const api = new IdentitiesBetaApi(this.config)

        const response = await Paginator.paginate(api, api.listIdentities)

        return response.data
    }

    async listIdentitiesByID(ids: string[]): Promise<IdentityDocument[]> {
        //I'm not sure how long a search query an be so I'd rather split this in batches
        const api = new SearchApi(this.config)
        let identities: IdentityDocument[] = []

        let offset = 0

        while (offset < ids.length) {
            const batch = ids.slice(offset, offset + BATCH_SIZE)
            offset += BATCH_SIZE
            const query = ids.map((x) => `id:${x}`).join(' OR ')
            const search: Search = {
                indices: ['identities'],
                query: {
                    query,
                },
                sort: ['id'],
                includeNested: true,
            }

            const response = await Paginator.paginateSearchApi(api, search)
            identities = [...identities, ...response.data] as IdentityDocument[]
        }

        return identities
    }

    async listPrivilegedIdentities(): Promise<IdentityDocument[]> {
        const api = new SearchApi(this.config)
        const search: Search = {
            indices: ['identities'],
            query: {
                query: '@access(source.name.exact:IdentityNow)',
            },
            sort: ['id'],
            includeNested: true,
        }

        const response = await Paginator.paginateSearchApi(api, search)

        if (response.data.length > 0) {
            return response.data as IdentityDocument[]
        } else {
            return []
        }
    }

    async listAccountsByIdentity(id: string): Promise<Account[]> {
        const api = new AccountsApi(this.config)

        const filters = `identityId eq "${id}"`
        const listAccountsByIdentity = (
            requestParameters?: AccountsApiListAccountsRequest,
            axiosOptions?: AxiosRequestConfig
        ): Promise<import('axios').AxiosResponse<Account[], any>> => {
            return api.listAccounts({ filters })
        }
        const response = await Paginator.paginate(api, listAccountsByIdentity)

        return response.data
    }

    async getAccountDetails(id: string): Promise<IdentityBeta> {
        const api = new IdentitiesBetaApi(this.config)

        const requestParameters: IdentitiesBetaApiGetIdentityRequest = {
            id,
        }
        const response = await api.getIdentity(requestParameters)

        return response.data
    }

    async addWorkgroup(id: string, workgroupId: string): Promise<WorkgroupMemberAddItemBeta[]> {
        const api = new GovernanceGroupsBetaApi(this.config)

        const requestParameters: GovernanceGroupsBetaApiUpdateWorkgroupMembersRequest = {
            workgroupId,
            bulkWorkgroupMembersRequestInnerBeta: [{ id }],
        }
        const response = await api.updateWorkgroupMembers(requestParameters)

        await sleep(2000)
        return response.data
    }

    async removeWorkgroup(id: string, workgroupId: string): Promise<WorkgroupMemberDeleteItemBeta[]> {
        const api = new GovernanceGroupsBetaApi(this.config)

        const requestParameters: GovernanceGroupsBetaApiDeleteWorkgroupMembersRequest = {
            workgroupId,
            bulkWorkgroupMembersRequestInnerBeta: [{ id }],
        }
        const response = await api.deleteWorkgroupMembers(requestParameters)

        await sleep(2000)
        return response.data
    }

    async getCapabilities(id: string): Promise<string[]> {
        const api = new AuthUserApi(this.config)

        const response = await api.getAuthUser({ id })
        const capabilities: string[] = response.data.capabilities || []

        return capabilities
    }

    async setCapabilities(id: string, capabilities: string[]): Promise<AuthUser> {
        const api = new AuthUserApi(this.config)

        const jsonPatchOperation: JsonPatchOperation[] = [
            {
                op: 'replace',
                path: '/capabilities',
                value: capabilities,
            },
        ]
        const requestParameters: AuthUserApiPatchAuthUserRequest = {
            id,
            jsonPatchOperation,
        }

        const response = await api.patchAuthUser(requestParameters)

        return response.data
    }

    async setLifecycleState(identityId: string, lifecycleStateId: string): Promise<SetLifecycleState200Response> {
        const api = new LifecycleStatesApi(this.config)

        const requestParameters: LifecycleStatesApiSetLifecycleStateRequest = {
            identityId,
            setLifecycleStateRequest: {
                lifecycleStateId,
            },
        }
        const response = await api.setLifecycleState(requestParameters)

        return response.data
    }

    async getWorkgroup(id: string): Promise<WorkgroupDtoBeta> {
        const api = new GovernanceGroupsBetaApi(this.config)

        const response = await api.getWorkgroup({ id })

        return response.data
    }

    // async getIdentityByUID(uid: string): Promise<IdentityDocument | undefined> {
    //     const api = new SearchApi(this.config)

    //     const search: Search = {
    //         indices: ['identities'],
    //         query: {
    //             query: `attributes.uid.exact:"${uid}"`,
    //         },
    //         sort: ['id'],
    //         includeNested: true,
    //     }
    //     const response = await api.searchPost({ search })

    //     if (response.data.length > 0) {
    //         return response.data[0]
    //     } else {
    //         return undefined
    //     }
    // }

    async getIdentityByUID(uid: string): Promise<IdentityBeta | undefined> {
        const api = new IdentitiesBetaApi(this.config)

        const requestParameters: IdentitiesBetaApiListIdentitiesRequest = {
            filters: `alias eq "${uid}"`,
        }
        const response = await api.listIdentities(requestParameters)

        if (response.data.length > 0) {
            return response.data[0]
        } else {
            return undefined
        }
    }

    async disableAccount(id: string): Promise<AccountsAsyncResult> {
        const api = new AccountsApi(this.config)

        const requestParameters: AccountsApiDisableAccountRequest = {
            id,
            accountToggleRequest: {
                forceProvisioning: true,
            },
        }
        const response = await api.disableAccount(requestParameters)

        return response.data
    }

    async enableAccount(id: string): Promise<AccountsAsyncResult> {
        const api = new AccountsApi(this.config)

        const requestParameters: AccountsApiEnableAccountRequest = {
            id,
            accountToggleRequest: {
                forceProvisioning: true,
            },
        }
        const response = await api.enableAccount(requestParameters)

        return response.data
    }

    async listWorkflows(): Promise<WorkflowBeta[]> {
        const api = new WorkflowsBetaApi(this.config)

        const response = await api.listWorkflows(axiosOptions)

        return response.data
    }

    async createWorkflow(workflow: WorkflowsBetaApiCreateWorkflowRequest): Promise<WorkflowBeta> {
        const api = new WorkflowsBetaApi(this.config)

        const response = await api.createWorkflow(workflow)

        return response.data
    }

    async testWorkflow(id: string, testWorkflowRequestBeta: TestWorkflowRequestBeta) {
        const api = new WorkflowsBetaApi(this.config)

        const requestParameters: WorkflowsBetaApiTestWorkflowRequest = {
            id,
            testWorkflowRequestBeta,
        }
        const response = await api.testWorkflow(requestParameters)
    }

    async getIdentity(id: string): Promise<IdentityDocument | undefined> {
        const api = new SearchApi(this.config)
        const search: Search = {
            indices: ['identities'],
            query: {
                query: `id:${id}`,
            },
            includeNested: true,
        }

        const response = await api.searchPost({ search })

        if (response.data.length > 0) {
            return response.data[0] as IdentityDocument
        } else {
            return undefined
        }
    }
}
