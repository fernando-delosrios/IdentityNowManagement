import { Attributes } from '@sailpoint/connector-sdk'

export class Account {
    identity: string
    uuid: string
    attributes: Attributes
    disabled: boolean

    constructor(object: any) {
        this.attributes = {
            id: object.id,
            name: object.attributes.uid || object.name,
            firstName: object.attributes.firstname || object.firstName,
            lastName: object.attributes.lastname || object.lastName,
            displayName: object.attributes.displayName || object.displayName,
        }
        this.disabled = object.enabled !== undefined ? !object.enabled : object.inactive
        this.identity = this.attributes.name as string
        this.uuid = this.attributes.name as string
    }
}
