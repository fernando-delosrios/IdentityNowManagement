import { Attributes } from '@sailpoint/connector-sdk'

export class Account {
    identity: string
    uuid: string
    attributes: Attributes
    disabled: boolean

    constructor(object: any) {
        this.attributes = {
            id: object.id,
            externalId: object.externalId,
            name: object.uid,
            firstName: object.attributes.firstname,
            lastName: object.attributes.lastname,
            displayName: object.name,
            enabled: !object.inactive,
            groups: object.role,
        }
        this.disabled = !this.attributes.enabled
        this.identity = this.attributes.id as string
        this.uuid = this.attributes.name as string
    }
}
