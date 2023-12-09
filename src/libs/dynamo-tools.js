// Serverless Lib ver: 0.1.12
const AWS = require('aws-sdk')


//  -----    Clientss
const dynamoClient = new AWS.DynamoDB.DocumentClient();

const s3 = new AWS.S3({
  apiVersion: '2006-03-01',
  signatureVersion: 'v4',
});


//  -----    FUCNTIONS

//  **** Dynamo
exports.getDynamoItem = async (params) => {
    const { table, hashKey, hash, sortKey, sort, attrib } = params

    let localParamas = {
        TableName : table,
        Key: { [hashKey]: hash },
        ProjectionExpression: attrib ? attrib : undefined,
    }

    if (sortKey && sort) {
        localParamas = {
            ...localParamas,
            Key: {
                ...localParamas.Key,
                [sortKey]: sort,
            }
        }
    }

    return await dynamoClient.get(localParamas).promise()
}

exports.deleteDynamoItem = async (params) => {
    const { table, hashKey, hash, sortKey, sort } = params

    let localParamas = {
        TableName : table,
        Key: { [hashKey]: hash }
    }
    
    if (sortKey && sort) {
        localParamas = {
            ...localParamas,
            Key: {
                ...localParamas.Key,
                [sortKey]: sort,
            }
        }
    }

    return await dynamoClient.delete(localParamas).promise()
}

exports.putDynamoItem = async (params) => {
    const { table, payload } = params

    const localParamas = {
        TableName : table,
        Item: payload,
    };

    return await dynamoClient.put(localParamas).promise()
}

exports.scanDynamoTable = async (params) => {
    const { table, limit = 50, select, itemOffset, indexName, attrib } = params

    const scanParams = {
        ConsistentRead: false,
        ExclusiveStartKey: itemOffset ? itemOffset : undefined,
        IndexName: indexName ? indexName : undefined,
        Limit: limit,
        Select: select ? select : undefined,
        TableName: table,
        ProjectionExpression: attrib ? attrib : undefined,
    };

    const result = await dynamoClient.scan(scanParams).promise();

    return {
        items: result.Items,
        count: result.ScannedCount,
        totalResults: result.Count,
        offset: result.LastEvaluatedKey ? Object.entries(result.LastEvaluatedKey)[0][1] : undefined,
    }
}

exports.recursiveScanDynamoTableWithFilter = async (params) => {
    const {
        table,
        select,
        limit = 50,
        itemOffset,
        indexName,
        filter,
        attrib,
        threshold,
        counter = 0
    } = params

    let scanParams = {
        ConsistentRead: false,
        ExclusiveStartKey: itemOffset ? itemOffset : undefined,
        IndexName: indexName ? indexName : undefined,
        Limit: limit,
        Select: select ? select : undefined,
        TableName: table,
    };
    
    if (attrib !== undefined) {
      if (!Array.isArray(attrib)) throw new Error('attrib is not an array')

      const attribObject = Object.fromEntries(attrib.map((item) => [[`#${item}`], item] ))
      const attribNames = attrib.map((item) => `#${item}`)
      
      scanParams = {
        ...scanParams,
        ExpressionAttributeNames: attribObject,
        ProjectionExpression: attribNames.join(","),
      }
    }

    const result = await dynamoClient.scan(scanParams).promise();

    let filtered = [...result.Items]
    if (filter) filtered = result.Items.filter(filter)    
  
    if (threshold) {
      if (typeof threshold !== 'number') throw new Error('threshold is not a number')

      if ((counter + filtered.length) >= threshold) {
          filtered.splice(threshold - counter)

          return {
              items: filtered,
              count: filtered.length,
              totalResults: filtered.length,
              //offset: result.LastEvaluatedKey ? filtered[filtered.length - 1][Object.entries(result.LastEvaluatedKey)[0][0]] : undefined
          }
      }
    }

    if (result.LastEvaluatedKey) {
        const recursiveResult = await recursiveScanDynamoTableWithFilter({
            table,
            filter,
            attrib,
            itemOffset: result.LastEvaluatedKey,
            threshold: threshold ? threshold : undefined,
            counter: counter ? counter + filtered.length : filtered.length,
        })

        filtered = [...filtered, ...recursiveResult.items]
    }

    return {
        items: filtered,
        count: filtered.length,
        totalResults: filtered.length,
        offset: result.LastEvaluatedKey ? Object.entries(result.LastEvaluatedKey)[0][1] : undefined,
    }
}

exports.recursiveScanSortedDynamoTableWithFilter = async (params) => {
    const {
      table,
      hashKey,
      hash,
      sortKey,
      sort,
      select,
      limit = 50,
      filter,
      attrib,
      indexName,
    } = params

    const scanParams = {
      TableName: table,
      IndexName: indexName ? indexName : undefined,
      ExpressionAttributeNames: {
        "#hashKey": hashKey,
        "#sortKey": sortKey
      },
      KeyConditionExpression: '#hashKey = :hash AND #sortKey < :sort',
      ExpressionAttributeValues: {
        ":hash": hash,
        ":sort": sort ? sort : Date.now(),
      },
      ScanIndexForward: false,
      ProjectionExpression: attrib ? attrib : undefined,
      //Select: select ? select : undefined,
      Limit: 15,
    };
    
    const result = await dynamoClient.query(scanParams).promise();

    let filtered = [...result.Items]
    if (filter) filtered = result.Items.filter(filter)    

    if (result.Items.length > 0) {
      const recursiveResult = await recursiveScanSortedDynamoTableWithFilter({
        ...params,
        sort: result.Items[result.Items.length - 1][sortKey]
      })

      filtered = [...filtered, ...recursiveResult.items]
    }

    return {
      items: filtered,
      count: filtered.length,
      totalResults: filtered.length,
      //offset: result.LastEvaluatedKey ? Object.entries(result.LastEvaluatedKey)[0][1] : undefined,
    }
}

exports.scanSortedDynamoHash = async (params) => {
    const { table, hashKey, hash, limit = 50, itemOffset, indexName, attrib } = params

    const queryScanParams = {
        TableName: table,
        IndexName: indexName ? indexName : undefined,
        ExpressionAttributeNames: {
            "#keyPartition": hashKey,
        },
        KeyConditionExpression: '#keyPartition = :hkey',
        ExpressionAttributeValues: {
            ":hkey": hash,
        },
        ScanIndexForward: itemOffset ? itemOffset : false,
        ProjectionExpression: attrib ? attrib : undefined,
        Limit: limit,
    };

    const result = await dynamoClient.query(queryScanParams).promise();

    return {
        items: result.Items,
        count: result.ScannedCount,
        totalResults: result.Count,
        offset: result.LastEvaluatedKey ? Object.entries(result.LastEvaluatedKey)[0][1] : undefined,
    }
}


exports.updateDynamoItem = async (params) => {
  const { hash, hashKey, sort, sortKey, table, payload } = params

  const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([prop, val]) => val !== undefined ))
  const keys = Object.keys(cleanPayload)

  const queryProps = keys.reduce((prev, next) => {
    return {
      ...prev,
      [`#${next.replace(/\_+/g, '')}`]: next,
    }
  }, { [`#${keys[0].replace(/\_+/g, '')}`]: keys[0] })

  const queryValues = keys.reduce((prev, next, idx) => {
    return {
      ...prev,
      [`:${idx}`]: cleanPayload[next]
    }
  }, { ":0": cleanPayload[keys[0]] } )

  const queryExpression = Object.keys(queryProps).map((prop, idx) => {
    if (idx === 0) {
      return `SET ${prop} = ${Object.keys(queryValues)[idx]}`
    } else {
      return `, ${prop} = ${Object.keys(queryValues)[idx]}`
    }
  })

  let paramsQuery = {
    TableName: table,
    Key: { [hashKey]: hash },
    ExpressionAttributeNames: queryProps,
    UpdateExpression: queryExpression.join(''),
    ExpressionAttributeValues: queryValues,
  }
  
    if (sortKey && sort) {
        paramsQuery = {
            ...paramsQuery,
            Key: {
                ...paramsQuery.Key,
                [sortKey]: sort,
            }
        }
    }

  await dynamoClient.update(paramsQuery).promise()
}

//  **** Dynamo Especial Ops

exports.getItemFromSecondaryIndex = async (params) => {
    const { table, hashKey, hash, indexName, attrib} = params
    
    const paramsQuery = {
      TableName: table,
      IndexName: indexName ? indexName : undefined,
      ExpressionAttributeNames: {
        "#HashKey": hashKey,
      },
      KeyConditionExpression: '#HashKey = :HashValue',
      ExpressionAttributeValues: {
        ':HashValue': hash,
      },
      ProjectionExpression: attrib ? attrib : undefined,
    }
    
    return await dynamoClient.query(paramsQuery).promise()
}

exports.pushItemInDynamoList = async (params) => {
    const { table, hashKey, hash, key, valor } = params
    if (!valor) throw new Error('No value to push provided')

    const { Item: item } = await getDynamoItem({ table, hashKey, hash })

    if (Object.prototype.hasOwnProperty.call(item, key)) {
        let listProp = item[key]
        listProp.push(valor)

        await updateDynamoItem({ table, hashKey, hash, payload: { [key]: listProp } })
    } else {
        await updateDynamoItem({ table, hashKey, hash, payload: { [key]: [valor] } })
    }
}

exports.removeItemInDynamoList = async (params) => {
    const { table, hashKey, hash, key, valor } = params
    if (!valor) throw new Error('No value to push provided')

    const { Item: item } = await getDynamoItem({ table, hashKey, hash })

    if (Object.prototype.hasOwnProperty.call(item, key)) {
        let listProp = item[key]

        const index = listProp.indexOf(valor)
        if (index > -1) { // only splice array when item is found
          listProp.splice(index, 1); // 2nd parameter means remove one item only
        } else {
            throw new Error('The supplied image is not found in the registry')
        }

        await updateDynamoItem({ table, hashKey, hash, payload: { [key]: listProp } })
    } else {
        throw new Error('The supplied image is not found in the registry')
    }
}

exports.atomicUpdateCounter = async (params) => {
  const { table, hashKey, hash, sortKey, sort, prop, amount, action } = params;

  let paramsQuery = {
    TableName: table,
    Key: {
      [hashKey]: hash,
    },
    ExpressionAttributeNames: {
      "#prop": prop
    },
    UpdateExpression: "Set #prop = #prop + :incr",
    ExpressionAttributeValues: {
      ":incr": amount
    },
  }

  if (sortKey && sort) {
    paramsQuery = {
      ...paramsQuery,
      Key: {
        ...paramsQuery.Key,
        [sortKey]: sort,
      }
    }
  }
  
  if (action && action === 'dec') {
    paramsQuery = {
      ...paramsQuery,
      UpdateExpression: "Set #prop = #prop - :incr",
    }
  }

  await dynamoClient.update(paramsQuery).promise()
}

//  **** Verification

exports.filterOnlyAllowedProps = (payload, requiredProps) => {
    const filteredPayload = Object.fromEntries(Object.entries(payload).filter(([prop, value]) => {
        if (requiredProps.includes(prop)) {
            return true
        } else {
            return false
        }
    }))

    return filteredPayload;
}

exports.allRequiredProps = (payload, requiredProps) => {
    const payloadKeys = Object.keys(payload)
    
    const filteredPayload = requiredProps.map((prop) => {
        if (payloadKeys.includes(prop))
            return true
        else
            return false
    })

    return !filteredPayload.some((valor) => valor === false);
}

//  **** S3

exports.getS3Object = async (params) => {
    const { bucket, key } = params

    const getObjectparams = {
      Bucket: bucket, 
      Key: key
    }

    return await s3.getObject(getObjectparams).promise();
}

exports.listS3Objects = async (params) => {
    const { bucket, dir } = params
    
    const listParams = {
        Bucket: bucket,
        Prefix: dir ? dir : undefined,
    };
    
    return await s3.listObjectsV2(listParams).promise();
}

exports.deleteS3Object = async (params) => {
    const { bucket, object } = params
    
    const objectSplit = object.split(`${bucket}.s3.amazonaws.com/`)
    const objectKey = objectSplit.pop()

    const S3Params = {
        Bucket: bucket,
        Key: objectKey
    }
   
    await s3.deleteObject(S3Params).promise()

}

exports.emptyS3Directory = async (params) => {
    const { bucket, dir } = params

    const listParams = {
        Bucket: bucket,
        Prefix: dir
    };

    const listedObjects = await s3.listObjectsV2(listParams).promise();

    if (listedObjects.Contents.length === 0) return;

    const deleteParams = {
        Bucket: bucket,
        Delete: { Objects: [] }
    };

    listedObjects.Contents.forEach(({ Key }) => {
        deleteParams.Delete.Objects.push({ Key });
    });

    await s3.deleteObjects(deleteParams).promise();

    if (listedObjects.IsTruncated)
    await emptyS3Directory({ bucket, dir });
}

exports.generateUUIDv4 = () => {
    return AWS.util.uuid.v4()
}


//  **** Response

exports.errorResponse = (error, headers, cookiePrefix, domain) => {

    let newHeaders = headers;
    if (error.message === 'Session is expired') {

        if(!cookiePrefix || !domain)
        throw new Error(`No cookiePrefix or domain provided in error response function`)

        newHeaders = {
            ...headers,
            "Set-Cookie":  `${cookiePrefix}=revoked; domain=${domain}; path=/; Secure; SameSite=None`
        }
    }

    const response = {
        statusCode: error.statusCode,
        headers: { ...newHeaders },
        body: JSON.stringify(error),
    }

    return response;
}