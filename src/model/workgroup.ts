import { Attributes } from '@sailpoint/connector-sdk'
import { WorkgroupDtoBeta } from 'sailpoint-api-client'

export class Workgroup {
    identity: string
    uuid: string
    type: string = 'workgroup'
    attributes: Attributes

    constructor(object: WorkgroupDtoBeta) {
        this.attributes = {
            type: 'Governance group',
            name: (object as any).name,
            id: object.id as string,
            description: object.description as string,
        }
        this.identity = this.attributes.id as string
        this.uuid = this.attributes.name as string
    }
}
