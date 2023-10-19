import { Attributes } from '@sailpoint/connector-sdk'

export type LCSSource = {
    name: string
    value: string
    description: string
}

export class LCS {
    identity: string
    uuid: string
    type: string = 'lcs'
    attributes: Attributes

    constructor(object: LCSSource) {
        this.attributes = {
            type: 'Lifecycle state',
            name: object.name,
            id: object.value,
            description: object.description,
        }
        this.identity = this.attributes.id as string
        this.uuid = this.attributes.name as string
    }
}
