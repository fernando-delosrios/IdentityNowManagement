import { Attributes } from '@sailpoint/connector-sdk'
import { LevelSource } from '../data/levels'

export class Level {
    identity: string
    uuid: string
    type: string = 'level'
    attributes: Attributes

    constructor(object: LevelSource) {
        this.attributes = {
            type: 'Level',
            name: object.name,
            id: object.value,
            description: object.description,
        }
        this.identity = this.attributes.id as string
        this.uuid = this.attributes.name as string
    }
}
