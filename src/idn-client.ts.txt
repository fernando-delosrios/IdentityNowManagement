//Kept for reference purposes
import axios, { AxiosRequestConfig, AxiosResponse, AxiosInstance } from 'axios'
import axiosRetry from 'axios-retry'

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

export class IDNClient {
    private httpClient: AxiosInstance
    private idnUrl: string
    private patId: string
    private patSecret: string
    private IDToken1: string
    private IDToken2: string
    private sailpointlogin: string
    private accessToken?: string
    private oathkeeperToken?: string
    private apiExpiryDate: Date
    private oathkeeperExpiryDate: Date
    private batchSize = 250
    private sleepMs = 100

    constructor(config: any) {
        this.idnUrl = config.idnUrl
        this.patId = config.patId
        this.patSecret = config.patSecret
        this.IDToken1 = config.IDToken1
        this.IDToken2 = config.IDToken2
        this.sailpointlogin = config.sailpointlogin
        this.apiExpiryDate = new Date()
        this.oathkeeperExpiryDate = new Date()

        this.httpClient = axios.create({
            baseURL: this.idnUrl,
        })
        axiosRetry(this.httpClient, {
            retries: 5,
            retryDelay: axiosRetry.exponentialDelay,
            retryCondition: axiosRetry.isRetryableError,
        })
    }

    async getApiToken(): Promise<string | undefined> {
        const url = `/oauth/token`
        if (new Date() >= this.apiExpiryDate) {
            const request: AxiosRequestConfig = {
                method: 'post',
                url,
                headers: {
                    Accept: 'application/json',
                },
                params: {
                    client_id: this.patId,
                    client_secret: this.patSecret,
                    grant_type: 'client_credentials',
                },
            }

            const response = await this.httpClient.request(request)
            this.accessToken = response.data.access_token
            this.apiExpiryDate = new Date()
            this.apiExpiryDate.setSeconds(this.apiExpiryDate.getSeconds() + response.data.expires_in)
        }

        return this.accessToken
    }

    async getOathkeeperToken(): Promise<string | undefined> {
        const pm = require('postman-request')
        const cheerio = require('cheerio')
        if (new Date() >= this.oathkeeperExpiryDate) {
            // Use a Promise to obtain the access token
            const accessTokenPromise = new Promise<string>((resolve, reject) => {
                pm.post(
                    {
                        url: this.sailpointlogin,
                        jar: true,
                        followAllRedirects: true,
                        removeRefererHeader: true,
                        form: {
                            IDToken1: this.IDToken1,
                            IDToken2: this.IDToken2,
                        },
                    },
                    function (err: any, response: any, body: any) {
                        if (err) {
                            reject(err)
                        } else {
                            const $ = cheerio.load(body)
                            const accessToken1 = $('script#slpt-globals-json').html()
                            resolve(JSON.parse(accessToken1 ?? '').api.accessToken)
                        }
                    }
                )
            })
            try {
                this.oathkeeperToken = await accessTokenPromise
                this.oathkeeperExpiryDate = new Date()
                // Set expiry date to 15 minutes from now
                this.oathkeeperExpiryDate.setMinutes(this.oathkeeperExpiryDate.getMinutes() + 15)
            } catch (err) {
                console.error('Error obtaining access token:', err)
            }
        }

        return this.oathkeeperToken
    }

    async testConnection(): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v3/public-identities-config`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }

        return this.httpClient.request(request)
    }

    async *getPrivilegedIdentities() {
        const token = await this.getApiToken()
        const url = `/v3/search`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            params: {
                limit: this.batchSize,
                count: true,
            },
            data: {
                query: {
                    query: '@access(source.name.exact:IdentityNow)',
                },
                sort: ['id'],
                indices: ['identities'],
                includeNested: true,
            },
        }

        let pendingItems = true
        let processed = 0

        while (pendingItems) {
            let response = await this.httpClient.request(request)
            const total = parseInt(response.headers['x-total-count'])
            processed += response.data.length
            pendingItems = total > processed
            request.data.searchAfter = [response.data[response.data.length - 1]['id']]
            yield response
            await sleep(this.sleepMs)
        }
    }

    async *accountAggregation() {
        const token = await this.getApiToken()
        const url = `/beta/identities`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            params: {
                limit: this.batchSize,
                count: true,
            },
        }

        let pendingItems = true
        let processed = 0

        while (pendingItems) {
            let response = await this.httpClient.request(request)
            const total = parseInt(response.headers['x-total-count'])
            processed += response.data.length
            pendingItems = total > processed
            request.params.offset = processed
            yield response
            await sleep(this.sleepMs)
        }
    }

    async getAccountDetails(id: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/beta/identities/${id}`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        }

        const response = await this.httpClient.request(request)

        return response
    }

    async getIdentityByUID(uid: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v3/search`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            data: {
                query: {
                    query: `attributes.uid.exact:"${uid}"`,
                },
                indices: ['identities'],
                includeNested: true,
            },
        }

        const response = await this.httpClient.request(request)
        response.data = response.data[0]

        return response
    }

    async getIdentityAccounts(id: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v3/accounts`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            params: {
                filters: `identityId eq "${id}"`,
            },
        }

        const response = await this.httpClient.request(request)

        return response
    }

    async getIdentityProfiles(): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v3/identity-profiles`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
        return await this.httpClient.request(request)
    }

    async getLifecycleStates(id: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v3/identity-profiles/${id}/lifecycle-states`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
        return await this.httpClient.request(request)
    }

    async roleAggregation(): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v3/search`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            data: {
                query: {
                    query: 'source.name.exact:IdentityNow AND attribute:assignedGroups',
                },
                indices: ['entitlements'],
                includeNested: false,
                sort: ['name'],
            },
        }

        const response = await this.httpClient.request(request)

        return response
    }

    async getRole(id: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v3/search`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            params: null,
            data: {
                query: {
                    query: `source.name.exact:IdentityNow AND attribute:assignedGroups AND value:${id}`,
                },
                indices: ['entitlements'],
                includeNested: false,
                sort: ['name'],
            },
        }

        const response = await this.httpClient.request(request)
        response.data = response.data.pop()

        return response
    }

    async *workgroupAggregation() {
        const token = await this.getApiToken()
        const url = `/beta/workgroups`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            params: {
                count: true,
                offset: 0,
                limit: this.batchSize,
            },
        }

        let pendingItems = true
        let processed = 0

        while (pendingItems) {
            let response = await this.httpClient.request(request)
            const total = parseInt(response.headers['x-total-count'])
            processed += response.data.length
            pendingItems = total > processed
            request.params.offset = processed
            yield response
            await sleep(this.sleepMs)
        }

        return await this.httpClient.request(request)
    }

    async getWorkgroup(id: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v2/workgroups/${id}`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        }

        return await this.httpClient.request(request)
    }

    async getWorkgroupMembership(id: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v2/workgroups/${id}/members`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        }

        return await this.httpClient.request(request)
    }

    async provisionLevels(id: string, roles: string[]): Promise<AxiosResponse> {
        const token = await this.getOathkeeperToken()
        const url = `/oathkeeper/auth-user-v3/auth-users/${id}`

        let request: AxiosRequestConfig = {
            method: 'patch',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json-patch+json',
            },
            data: [{ op: 'replace', path: '/capabilities', value: roles }],
        }

        await sleep(2000)
        return await this.httpClient.request(request)
    }

    async addWorkgroup(id: string, workgroup: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v2/workgroups/${workgroup}/members`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            data: {
                add: [id],
                remove: [],
            },
        }

        await sleep(2000)
        return await this.httpClient.request(request)
    }

    async removeWorkgroup(id: string, workgroup: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v2/workgroups/${workgroup}/members`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            data: {
                add: [],
                remove: [id],
            },
        }

        await sleep(2000)
        return await this.httpClient.request(request)
    }

    async setLifecycleState(id: string, lifecycleStateId: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/v3/identities/${id}/set-lifecycle-state`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            data: {
                lifecycleStateId,
            },
        }

        const response = await this.httpClient.request(request)
        await sleep(5000)

        return response
    }

    async enableAccount(id: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/beta/identities-accounts/${id}/enable`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }

        await sleep(2000)
        return await this.httpClient.request(request)
    }

    async disableAccount(id: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/beta/identities-accounts/${id}/disable`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }

        await sleep(2000)
        return await this.httpClient.request(request)
    }

    async processIdentity(id: string): Promise<AxiosResponse> {
        const token = await this.getApiToken()
        const url = `/beta/identities/process`

        let request: AxiosRequestConfig = {
            method: 'post',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            data: {
                identityIds: [id],
            },
        }

        const response = await this.httpClient.request(request)

        return response
    }

    async getCapabilities(id: string): Promise<AxiosResponse> {
        const token = await this.getOathkeeperToken()
        const url = `/oathkeeper/auth-user-v3/auth-users/${id}`

        let request: AxiosRequestConfig = {
            method: 'get',
            url,
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
        const response = await this.httpClient.request(request)
        return response
    }
}
