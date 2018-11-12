const { isRedirectCode } = require('./util');

const BASE_TYPE = [
  'string',
  'number',
  'boolean',
  'array',
  'object',
  'integer',
  'null',
  'any'
];

const setProps = (obj, property, value) => {
  if (value) obj[property] = value;
};

const getDefinitionSchama = apiJSON => {
  const $id = '/definitionSchema';
  const definitionSchama = {
    $id,
    definitions: {}
  };
  const clazzArr = apiJSON.types();
  clazzArr.forEach(clazz => {
    const clazzName = clazz.name();
    const jsonObj = clazz.toJSON({ serializeMetadata: false });
    const { properties } = jsonObj[clazzName];

    if (!properties) return;

    const requiredArr = [];
    const schamaProperties = {};
    Object.keys(properties).forEach(key => {
      const {
        items,
        required,
        name,
        type,
        maxLength,
        minLength,
        pattern
      } = properties[key];

      const property = {
        type
      };
      setProps(property, 'maxLength', maxLength);
      setProps(property, 'minLength', minLength);
      setProps(property, 'pattern', pattern);
      if (required) {
        requiredArr.push(name);
        delete property.required;
      }
      schamaProperties[name] = property;

      if (!BASE_TYPE.includes(type[0])) {
        schamaProperties[name] = { $ref: `${$id}#/definitions/${type[0]}` };
        return;
      }

      if (items) {
        const $ref = { $ref: `${$id}#/definitions/${items}` };
        schamaProperties[name] = {
          items: [$ref],
          additionalItems: $ref
        };
      }
    });

    const sechemaPro = {
      type: 'object',
      properties: schamaProperties,
      required: requiredArr
    };

    definitionSchama.definitions[clazzName] = sechemaPro;
  });
  return definitionSchama;
};

exports.getDefinitionSchama = getDefinitionSchama;

const getSchamaByType = type => {
  if (!type) return undefined;
  const newType = type.replace('[]', '');
  if (BASE_TYPE.includes(newType)) return undefined;
  const $ref = { $ref: `/definitionSchema#/definitions/${newType}` };
  let schema = $ref;
  if (type.includes('[]')) {
    schema = {
      items: [$ref],
      additionalItems: $ref
    };
  }
  return schema;
};

const getQueryParameter = queryParameters => {
  if (!Array.isArray(queryParameters)) return {};
  const newParam = {};
  queryParameters.forEach(param => {
    if (!param.example()) return;
    const value = param.example().value();
    if (!value) return;
    newParam[param.name()] = value;
  });
  return newParam;
};

const getPostBody = ([body]) => {
  if (!body) return undefined;
  const value = body.example().value();
  if (!value) return undefined;
  return {
    mimeType: body.name(),
    value
  };
};

const getWebApiArr = apiJSON => {
  const webApiArr = [];
  apiJSON.allResources().forEach(resource => {
    const absoluteUri = resource.absoluteUri();
    // has bug: https://github.com/raml-org/raml-js-parser-2/issues/829
    // resource.uriParameters().forEach(parameter => {
    //   // console.log(parameter.toJSON());
    //   const name = parameter.name();
    //   absoluteUri = absoluteUri.replace(`{${name}}`, `:${name}`);
    //   // console.log(parameter.description());
    // });
    resource.methods().forEach(method => {
      const webApi = { absoluteUri, method: method.method() };
      method.annotations().forEach(annotation => {
        const json = annotation.toJSON();
        if (json.name !== 'controller') return;
        webApi.controller = json.structuredValue;
      });

      webApi.queryParameter = getQueryParameter(method.queryParameters());
      const requestBody = getPostBody(method.body());
      if (requestBody) webApi.body = requestBody;

      webApi.responses = [];
      method.responses().forEach(response => {
        const code = response.code().value();
        // 30x
        if (isRedirectCode(code)) {
          response.headers().forEach(typeDeclaration => {
            if (typeDeclaration.name().toLowerCase() === 'location') {
              const redirectURL = typeDeclaration.type()[0];
              webApi.responses.push({ code, location: redirectURL });
            }
          });
          return;
        }
        response.body().forEach(body => {
          const example = body.example();
          if (!example) return;
          const mimeType = body.name();
          const type = body.type().pop();
          const webApiResp = {
            code,
            body: example.value(),
            mimeType
          };
          const schema = getSchamaByType(type);
          if (schema) webApiResp.schema = schema;
          webApi.responses.push(webApiResp);
        });
      });
      webApiArr.push(webApi);
    });
  });
  return webApiArr;
};

exports.getWebApiArr = getWebApiArr;
