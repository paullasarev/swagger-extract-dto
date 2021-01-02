import { get } from 'lodash';

import { getResponseNode } from './typescript';

describe('getResponseNode', () => {
  it('should get content["application/json"]', () => {
    const node = {
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: {
                type: 'string',
              },
            },
          },
        },
      },
    };
    const path = 'responses.200.content["application/json"]';
    const { response, responsePath } = getResponseNode(node);
    expect(response).toBe(get(node, path, {}));
    expect(responsePath).toBe(path);
  });
  it('should get content["*/*"]', () => {
    const node = {
      responses: {
        '200': {
          content: {
            '*/*': {
              schema: {
                type: 'string',
              },
            },
          },
        },
      },
    };
    const path = 'responses.200.content["*/*"]';
    const { response, responsePath } = getResponseNode(node);
    expect(response).toBe(get(node, path, {}));
    expect(responsePath).toBe(path);
  });
  it('should get "responses.200"', () => {
    const node = {
      responses: {
        '200': {
          schema: {
            type: 'string',
          },
        },
      },
    };
    const path = 'responses.200';
    const { response, responsePath } = getResponseNode(node);
    expect(response).toBe(get(node, path, {}));
    expect(responsePath).toBe(path);
  });
  it('should not get "responses.200" id no schema', () => {
    const node = {
      responses: {
        '200': {
          type: 'string',
        },
      },
    };
    const path = 'responses.200';
    const { response, responsePath } = getResponseNode(node);
    expect(response).toBeUndefined();
    expect(responsePath).toBeUndefined();
  });
});
