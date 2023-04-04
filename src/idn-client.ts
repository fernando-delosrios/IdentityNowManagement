import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'

export class IDNClient {
    private readonly idnUrl?: string
    private readonly patId?: string
    private readonly patSecret?: string
    private accessToken?: string
    private expiryDate: Date
    private batchSize: number

    constructor(config: any) {
        this.idnUrl = config.idnUrl
        this.patId = config.patId
        this.patSecret = config.patSecret
        this.expiryDate = new Date()
        this.batchSize = 100
    }

    async getAccessToken(): Promise<string | undefined> {
        const url: string = `/oauth/token`
        if (new Date() >= this.expiryDate) {
            const request: AxiosRequestConfig = {
                method: 'post',
                baseURL: this.idnUrl,
                url,
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
                params: {
                    client_id: this.patId,
                    client_secret: this.patSecret,
                    grant_type: 'client_credentials',
                },
            }
            const response: AxiosResponse = await axios(request)
            this.accessToken = response.data.access_token
            this.expiryDate = new Date()
            this.expiryDate.setSeconds(this.expiryDate.getSeconds() + response.data.expires_in)
        }

        return this.accessToken
    }

    async testConnection(): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v3/public-identities-config`

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        }

        return axios(request)
    }

    async accountAggregation(): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v3/search`

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
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
                includeNested: false,
                queryResultFilter: {
                    includes: ['name'],
                },
            },
        }

        let data: any[] = []

        let response = await axios(request)
        const total: number = parseInt(response.headers['X-Total-Count'])
        data = [...data, ...response.data]

        while (total > data.length) {
            request.data.searchAfter = data[data.length - 1]['id']
            response = await axios(request)
            data = [...data, ...response.data]
        }
        response.data = data
        return response
    }

    async getAccountDetails(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v2/identities/${id}`

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: null,
            data: null,
        }

        return await axios(request)
    }

    async getAccountDetailsByName(name: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v2/search/identities`

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: {
                query: `name:${name}`,
            },
            data: null,
        }

        return await axios(request)
    }

    async roleAggregation(): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v3/search`

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
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

        return await axios(request)
    }

    async workgroupAggregation(): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v2/workgroups`

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        }

        return await axios(request)
    }

    async getWorkgroup(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v2/workgroups/${id}`

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        }

        return await axios(request)
    }

    async getRoleDetails(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v3/search`

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
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

        return await axios(request)
    }

    async getWorkgroupDetails(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v2/workgroups/${id}/members`

        let request: AxiosRequestConfig = {
            method: 'get',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
        }

        return await axios(request)
    }

    async enableAccount(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/cc/api/user/enabled`

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            params: {
                ids: id,
                enabled: true,
            },
            data: null,
        }

        return await axios(request)
    }

    async disableAccount(id: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/cc/api/user/enabled`

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json',
            },
            params: {
                ids: id,
                enabled: false,
            },
            data: null,
        }

        return await axios(request)
    }

    async addRole(id: string, role: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/cc/api/user/updatePermissions`

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            params: null,
            data: {
                ids: id,
                isAdmin: '1',
                adminType: role,
            },
        }

        return await axios(request)
    }

    async removeRole(id: string, role: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/cc/api/user/updatePermissions`

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            params: null,
            data: {
                ids: id,
                isAdmin: '0',
                adminType: role,
            },
        }

        return await axios(request)
    }

    async addWorkgroup(id: string, workgroup: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v2/workgroups/${workgroup}/members`

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            data: {
                add: [id],
                remove: [],
            },
        }

        return await axios(request)
    }

    async removeWorkgroup(id: string, workgroup: string): Promise<AxiosResponse> {
        const accessToken = await this.getAccessToken()
        const url: string = `/v2/workgroups/${workgroup}/members`

        let request: AxiosRequestConfig = {
            method: 'post',
            baseURL: this.idnUrl,
            url,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            data: {
                add: [],
                remove: [id],
            },
        }

        return await axios(request)
    }
}
