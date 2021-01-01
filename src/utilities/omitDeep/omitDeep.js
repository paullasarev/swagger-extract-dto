const { reduce, isObject, isArray, map } = require('lodash');

const MAX_DEEP_LEVEL = 100;

export function omitDeep (value, allKeys, level = 0) {
  if (level > MAX_DEEP_LEVEL) {
    return value;
  }

  if (typeof value === 'undefined') {
    return value;
  }

  const keys = isArray(allKeys) ? allKeys : [allKeys];

  if (isArray(value)) {
    return map(value, (item) => omitDeep(item, keys, level + 1));
  }

  if (!isObject(value)) {
    return value;
  }

  const result = reduce(
    value,
    (acc, val, key) => {
      if (keys.includes(key)) {
        return acc;
      }
      acc[key] = omitDeep(val, keys, level + 1);
      return acc;
    },
    {}
  );

  return result;
}

module.exports = {
  omitDeep
};
