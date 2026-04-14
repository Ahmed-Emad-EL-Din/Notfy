import { MongoClient, ObjectId } from 'mongodb'
import * as admin from 'firebase-admin'

const uri = process.env.VITE_MONGODB_URI
let cachedClient: MongoClient | null = null

// Initialize Firebase Admin for token verification
// This only requires project ID if not accessing Firestore/Storage
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.VITE_FIREBASE_PROJECT_ID
  })
}

async function connectToDatabase() {
  if (cachedClient) return cachedClient
  if (!uri) throw new Error('VITE_MONGODB_URI is not defined in environment')
  
  const client = new MongoClient(uri)
  await client.connect()
  cachedClient = client
  return client
}

// Middleware to verify Firebase JWT
async function verifyAuth(event: any) {
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized')
  }
  const token = authHeader.split('Bearer ')[1]
  try {
    const decodedToken = await admin.auth().verifyIdToken(token)
    return decodedToken.uid
  } catch (error) {
    throw new Error('Unauthorized: Invalid token')
  }
}

export const handler = async (event: any, context: any) => {
  // Allow CORS for local dev
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const uid = await verifyAuth(event)
    
    const client = await connectToDatabase()
    const db = client.db('notfy')
    
    const { action } = event.queryStringParameters || {}
    let body: any = {}
    if (event.body) {
      try {
        body = JSON.parse(event.body)
      } catch (e) {
        // Handle empty or invalid body
      }
    }

    if (action === 'upsertUser' && event.httpMethod === 'POST') {
      const { id, email, name, is_admin } = body
      // Ensure user can only upsert their own record
      if (id !== uid) throw new Error('Unauthorized')
      
      await db.collection('users').updateOne(
        { id },
        { $set: { id, email, name, is_admin, updated_at: new Date() } },
        { upsert: true }
      )
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }
    
    if (action === 'getTasks' && event.httpMethod === 'GET') {
      const { userId } = event.queryStringParameters || {}
      if (userId !== uid) throw new Error('Unauthorized')
      
      const tasks = await db.collection('tasks').find({ user_id: userId }).toArray()
      return { statusCode: 200, headers, body: JSON.stringify(tasks) }
    }

    if (action === 'addTask' && event.httpMethod === 'POST') {
      if (body.user_id !== uid) throw new Error('Unauthorized')
      
      const result = await db.collection('tasks').insertOne({
        ...body,
        _id: new ObjectId().toString()
      })
      const task = await db.collection('tasks').findOne({ _id: result.insertedId })
      return { statusCode: 200, headers, body: JSON.stringify(task) }
    }

    if (action === 'updateTask' && event.httpMethod === 'PUT') {
      const { id, completed } = body
      // Need to verify task belongs to user
      const existingTask = await db.collection('tasks').findOne({ _id: id })
      if (!existingTask || existingTask.user_id !== uid) throw new Error('Unauthorized')

      await db.collection('tasks').updateOne({ _id: id }, { $set: { completed } })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'upsertSubscription' && event.httpMethod === 'POST') {
      const { user_id, endpoint, p256dh, auth } = body
      if (user_id !== uid) throw new Error('Unauthorized')

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
      statusCode: error.message.includes('Unauthorized') ? 401 : 500,
      headers,
      body: JSON.stringify({ error: error.message })
    }
  }
}
