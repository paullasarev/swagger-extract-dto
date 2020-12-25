import deepFreeze from 'deep-freeze'

import { omitDeep } from './omitDeep.js'

describe('omit unnecessary object properties', () => {
  const schemeMedia1 = {
    app: {
      someData: {
        payload: 'payload',
        isFetched: true
      }
    },
    media: {
      byId: {
        media_1: {
          id: 'media_1',
          pending: false,
          isFetched: true
        },
        media_2: {
          id: 'media_2',
          pending: false,
          isFetched: true
        }
      }
    }
  }

  const schemeMedia2 = {
    media_2: {
      id: 'media_2',
      pending: false,
      isFetched: true
    }
  }

  it('should omit pending and isFetched object props. params as string[]', () => {
    const omited = omitDeep(deepFreeze(schemeMedia1), ['pending', 'isFetched'])
    expect(omited).toEqual({
      app: {
        someData: { payload: 'payload' }
      },
      media: {
        byId: { media_1: { id: 'media_1' }, media_2: { id: 'media_2' } }
      }
    })
  })

  it('should omit pending and isFetched object props. params as string', () => {
    const omited2 = omitDeep(deepFreeze(schemeMedia2), 'pending')
    expect(omited2).toEqual({
      media_2: { id: 'media_2', isFetched: true }
    })
  })

  it('should omit pending in not more than MAX level', () => {
    const obj1 = {
      a0: {
        a1: {
          a2: {
            a3: { a4: { a5: { a6: { a7: { a8: { a9: { a10: { a11: 'a11', pending: 1 } } } } } } } }
          }
        }
      }
    }
    const omited2 = omitDeep(deepFreeze(obj1), 'pending')
    expect(omited2).toEqual(obj1)
  })

  it('should omit pending in array', () => {
    const obj1 = { a0: [{ a1: { a2: 'a2', pending: 1 } }] }
    const obj2 = { a0: [{ a1: { a2: 'a2' } }] }
    const omited2 = omitDeep(deepFreeze(obj1), 'pending')
    expect(omited2).toEqual(obj2)
  })
})
