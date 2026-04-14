import { MongoClient, ObjectId } from 'mongodb'

const uri = process.env.VITE_MONGODB_URI
let cachedClient: MongoClient | null = null

async function connectToDatabase() {
  if (cachedClient) return cachedClient
  if (!uri) throw new Error('VITE_MONGODB_URI is not defined in environment')
  
  const client = new MongoClient(uri)
  await client.connect()
  cachedClient = client
  return client
}

export const handler = async (event: any, context: any) => {
  // Allow CORS for local dev
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const client = await connectToDatabase()
    const db = client.db('notfy') // Database name defaults to notfy
    
    const { action } = event.queryStringParameters || {}
    let body = {}
    if (event.body) {
      body = JSON.parse(event.body)
    }

    if (action === 'upsertUser' && event.httpMethod === 'POST') {
      const { id, email, name, is_admin } = body as any
      await db.collection('users').updateOne(
        { id },
        { $set: { id, email, name, is_admin, updated_at: new Date() } },
        { upsert: true }
      )
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }
    
    if (action === 'getTasks' && event.httpMethod === 'GET') {
      const { userId } = event.queryStringParameters || {}
      const tasks = await db.collection('tasks').find({ user_id: userId }).toArray()
      return { statusCode: 200, headers, body: JSON.stringify(tasks) }
    }

    if (action === 'addTask' && event.httpMethod === 'POST') {
      const result = await db.collection('tasks').insertOne({
        ...body,
        _id: new ObjectId().toString() // Use string ID to match frontend expectations
      })
      const task = await db.collection('tasks').findOne({ _id: result.insertedId })
      return { statusCode: 200, headers, body: JSON.stringify(task) }
    }

    if (action === 'updateTask' && event.httpMethod === 'PUT') {
      const { id, completed } = body as any
      await db.collection('tasks').updateOne({ _id: id }, { $set: { completed } })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'upsertSubscription' && event.httpMethod === 'POST') {
      const { user_id, endpoint, p256dh, auth } = body as any
      await db.collection('push_subscriptions').updateOne(
        { endpoint },
        { $set: { user_id, endpoint, p256dh, auth, updated_at: new Date() } },
        { upsert: true }
      )
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action or method' }) }

  } catch (error: any) {
    console.error('API Error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    }
  }
}
