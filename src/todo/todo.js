'use strict';
const {
  putDynamoItem,
  recursiveScanDynamoTableWithFilter,
  generateUUIDv4,
  getDynamoItem,
  filterOnlyAllowedProps,
  updateDynamoItem,
  deleteDynamoItem,
} = require('../libs/dynamo-tools')


const todoDB = process.env.SERVERLESS_DB_TODO || '';
if (!todoDB) { throw new Error('env var required for todoDB') }

module.exports.handler = async (event) => {

  const headers =  {
    "Access-Control-Allow-Origin": event.headers.origin,
    "Content-Type": "application/json",
    'Access-Control-Allow-Methods': 'POST,GET,PUT,OPTIONS,DELETE',
    'Access-Control-Allow-Credentials': true,
  }

  let bodyData;
  let resultado;

  try {
    switch(event.resource) {
      case '/todos/{todo-id}':
        switch (event.httpMethod) {
          case 'GET':

            // Verificando existencia del id de la tarea
            if (!event.pathParameters)
            throw new Error('No se ha proveido el id de la tarea')

            if (!event.pathParameters['todo-id'])
            throw new Error('No se ha proveido el id de la tarea')

            const todoItem = await getDynamoItem({
              table: todoDB,
              hashKey: 'id_item',
              hash: event.pathParameters['todo-id']
            })

            // No se ha encontrado la tarea en el registro
            if (!todoItem.Item)
            throw new Error('No se ha encontrado la tarea en el registro')

            resultado = {
              ...todoItem.Item
            }

            break;

            case 'PUT':

              // Verificando existencia del id de la tarea
              if (!event.pathParameters)
              throw new Error('No se ha proveido el id de la tarea')
  
              if (!event.pathParameters['todo-id'])
              throw new Error('No se ha proveido el id de la tarea')
  
              // Verificando si existe un payload
              if (event.body) { bodyData = JSON.parse(event.body) }
              else { throw new Error('Payload is not present in request') }
  
              // Verificando si hay atributos para cambiar
              if (Object.keys(bodyData).length === 0) 
              throw new Error('No se ha provehido atributos para actualizar')
  
              // Filtrando atributos permitidos
              const allowedProps = [ 'titulo', 'mensaje' ]
              const propsToUpdate = filterOnlyAllowedProps(bodyData, allowedProps)
  
              // Verificando si la tarea existe
              const existItemToUpdate =  await getDynamoItem(({
                table: todoDB,
                hashKey: 'id_item',
                hash: event.pathParameters['todo-id'],
              }))
  
              if (!existItemToUpdate.Item)
              throw new Error('La tarea no existe en el registro')
  
              // Actualizando la tarea
              await updateDynamoItem({
                table: todoDB,
                hashKey: 'id_item',
                hash: event.pathParameters['todo-id'],
                payload: {
                  ...propsToUpdate,
                }
              })
  
              console.log(33333)
              resultado = {
                result: 'Se ha actualizado la tarea'
              }
  
              break;

          case 'DELETE':

            // Verificando existencia del id de la tarea
            if (!event.pathParameters)
            throw new Error('No se ha proveido el id de la tarea')

            if (!event.pathParameters['todo-id'])
            throw new Error('No se ha proveido el id de la tarea')

            // Verificando si la tarea existe
            const existItemToDelete =  await getDynamoItem(({
              table: todoDB,
              hashKey: 'id_item',
              hash: event.pathParameters['todo-id'],
            }))

            if (!existItemToDelete.Item)
            throw new Error('La tarea no existe en el registro')

            // eliminando la tarea
            await deleteDynamoItem({
              table: todoDB,
              hashKey: 'id_item',
              hash: event.pathParameters['todo-id']
            })

            resultado = {
              result: 'exito al eliminar la tarea'
            }

            break;
        }

        break;

      case '/todos':

        switch (event.httpMethod) {
          case 'GET':

            const scanToDos = await recursiveScanDynamoTableWithFilter({
              table: todoDB
            })

            resultado = {
              ...scanToDos
            }

            break;

          case 'POST':

            // Verificando si existe un payload
            if (event.body) { bodyData = JSON.parse(event.body) }
            else { throw new Error('Payload is not present in request') }

            // Verificando propiedad 'mensaje' en el payload
            if (!bodyData.titulo)
            throw new Error('titulo no esta presente en el payload')

            // Verificando propiedad 'mensaje' en el payload
            if (!bodyData.mensaje)
            throw new Error('mensaje no esta presente en el payload')

            const idNuevaTarea = generateUUIDv4()

            // Insertando nuevo item en la tabla dynamo
            await putDynamoItem({
              table: todoDB,
              payload: {
                id_item: idNuevaTarea,
                titulo: bodyData.titulo,
                mensaje: bodyData.mensaje,
              }
            })

            resultado = {
              result: 'tarea creada exitosamente',
              id: idNuevaTarea
            }

            break;
        }

        break;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(
        {
          result: resultado
        },
        null,
        2
      ),
    };

  } catch (error) {
  
    console.log(error)
    const errorResponse = {
      statusCode: 400,
      body: JSON.stringify({
        message: error.message,
        time: event.requestContext.requestTime,
        requestId: event.requestContext.requestId,
      }),
    }

    return errorResponse
  }
};
