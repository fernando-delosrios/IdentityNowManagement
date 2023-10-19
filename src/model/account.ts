import { Attributes } from '@sailpoint/connector-sdk'

const isDisabled = (object: any): boolean => {
    const status = object.identityStatus
    return status === 'DISABLED'
}

export class AccountResponse {
    identity: string
    uuid: string
    attributes: Attributes
    disabled: boolean

    constructor(object: any) {
        this.attributes = {
            id: object.id,
            uid: object.attributes.uid,
            firstName: object.attributes.firstname,
            lastName: object.attributes.lastname,
            displayName: object.attributes.displayName,
        }
        this.disabled = isDisabled(object)
        this.identity = this.attributes.id as string
        this.uuid = this.attributes.uid as string
    }
}
