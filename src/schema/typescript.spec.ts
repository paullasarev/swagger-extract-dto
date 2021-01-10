import { get } from 'lodash';

import {
  getPropertyNodeExtractor,
  getResponseNode,
  makeApiPathText,
  makeDTOs,
  makeEndpointNodes,
  makeInterfaceNode,
  makeRootContext,
  makeTypeContext,
  processParameter,
} from './typescript';

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

describe('makeInterfaceNode', () => {
  const schemaPet = {
    type: 'object',
    required: ['name', 'photoUrls'],
    properties: {
      id: { type: 'integer', format: 'int64' },
      category: { $ref: '#/definitions/Category' },
      name: { type: 'string', example: 'doggie' },
      photoUrls: {
        type: 'array',
        xml: { wrapped: true },
        items: { type: 'string', xml: { name: 'photoUrl' } },
      },
      tags: {
        type: 'array',
        xml: { wrapped: true },
        items: { xml: { name: 'tag' }, $ref: '#/definitions/Tag' },
      },
      status: {
        type: 'string',
        description: 'pet status in the store',
        enum: ['available', 'pending', 'sold'],
      },
    },
  };
  const rootContext = makeRootContext('.', {}, {});

  describe('getPropertyNodeExtractor', () => {
    it('should create required props', () => {
      const typeContext = makeTypeContext('', rootContext);
      const extractor = getPropertyNodeExtractor(schemaPet, typeContext, '');
      const node = extractor(schemaPet.properties.name, 'name');
      expect(node.questionToken).toBeUndefined();
    });
    it('should create non-required props', () => {
      const typeContext = makeTypeContext('', rootContext);
      const extractor = getPropertyNodeExtractor(schemaPet, typeContext, '');
      const node = extractor(schemaPet.properties.status, 'status');
      expect(node.questionToken).not.toBeUndefined();
    });
  });
});

describe('processApiMethod', () => {
  const pathUploadImage = '/pet/{petId}/uploadImage';
  const pathApiText = makeApiPathText(pathUploadImage);
  const schemaPostUploadImage = {
    tags: ['pet'],
    summary: 'uploads an image',
    description: '',
    operationId: 'uploadFile',
    parameters: [
      {
        name: 'petId',
        in: 'path',
        description: 'ID of pet to update',
        required: true,
        type: 'integer',
        format: 'int64',
      },
      {
        name: 'name',
        in: 'query',
        description: 'Additional data to pass to server',
        required: true,
        type: 'string',
      },
      {
        name: 'file',
        in: 'query',
        description: 'file to upload',
        required: false,
        type: 'string',
      },
    ],
    responses: {
      '200': {
        description: 'successful operation',
        schema: {
          type: 'object',
        },
      },
    },
    security: [{ petstore_auth: ['write:pets', 'read:pets'] }],
  };
  const rootContext = makeRootContext('.', {}, {});
  const DTOs = makeDTOs(schemaPostUploadImage);

  describe('makeEndpointNodes', () => {
    const typeContext = makeTypeContext('', rootContext);
    const node = makeEndpointNodes(typeContext, DTOs, '', pathApiText);
    const parameters = get(node, 'declarationList.initializer.parameters');
    it('should create params', () => {
      expect(parameters).toBeDefined();
      expect(get(parameters[0], 'name.escapedText')).toBe('petId');
      expect(get(parameters[1], 'name.escapedText')).toBe('name');
      expect(get(parameters[2], 'name.escapedText')).toBe('file');
    });
    it('should create required params', () => {
      expect(get(parameters[0], 'questionToken')).not.toBeDefined();
      expect(get(parameters[1], 'questionToken')).not.toBeDefined();
    });
    it('should create non-required params', () => {
      expect(get(parameters[2], 'questionToken')).toBeDefined();
    });
  });
});
