import { MongoClient, ObjectId } from 'mongodb'
import * as admin from 'firebase-admin'

const uri = process.env.VITE_MONGODB_URI
let cachedClient: MongoClient | null = null

// Initialize Firebase Admin for token verification
// This only requires project ID if not accessing Firestore/Storage
if (!admin.apps.length && process.env.VITE_FIREBASE_PROJECT_ID) {
  try {
    admin.initializeApp({
      projectId: process.env.VITE_FIREBASE_PROJECT_ID
    })
  } catch (e) {
    console.error("Firebase admin init error:", e)
  }
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

  // Allow local development bypass explicitly if using the dummy token AND local
  const host = event.headers.host || ''
  if (token === 'local-debug-token' && (host.includes('localhost') || host.includes('127.0.0.1'))) {
    return 'local-admin-debug'
  }

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
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
      
      // Get linked admins for this user
      const userLinks = await db.collection('user_links').find({ user_id: uid, active: true }).toArray()
      const adminIds = userLinks.map(link => link.admin_id)

      // Get user's personal tasks OR tasks made by linked admins that are global
      const tasks = await db.collection('tasks').find({
        $or: [
          { user_id: uid },
          { user_id: { $in: adminIds }, visibility: 'global' }
        ]
      }).sort({ created_at: -1 }).toArray()
      
      return { statusCode: 200, headers, body: JSON.stringify(tasks) }
    }

    if (action === 'addTask' && event.httpMethod === 'POST') {
      if (body.user_id !== uid) throw new Error('Unauthorized')
      
      const doc = {
        ...body,
        _id: new ObjectId().toString(),
        created_at: new Date().toISOString()
      }
      const result = await db.collection('tasks').insertOne(doc)
      const task = await db.collection('tasks').findOne({ _id: result.insertedId })
      return { statusCode: 200, headers, body: JSON.stringify(task) }
    }

    if (action === 'updateTask' && event.httpMethod === 'PUT') {
      const { id, ...updates } = body
      const existingTask = await db.collection('tasks').findOne({ _id: id })
      if (!existingTask) throw new Error('Task not found')
      
      // Task owners and admins who created it can edit
      if (existingTask.user_id !== uid) throw new Error('Unauthorized')

      await db.collection('tasks').updateOne({ _id: id }, { $set: updates })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'deleteTask' && event.httpMethod === 'DELETE') {
      const { id } = body
      const existingTask = await db.collection('tasks').findOne({ _id: id })
      if (!existingTask || existingTask.user_id !== uid) throw new Error('Unauthorized')

      await db.collection('tasks').deleteOne({ _id: id })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    // Admin & Links
    if (action === 'getLinkedUsers' && event.httpMethod === 'GET') {
      const links = await db.collection('user_links').find({ admin_id: uid, active: true }).toArray()
      const userIds = links.map(l => l.user_id)
      const users = await db.collection('users').find({ id: { $in: userIds } }).toArray()
      
      return { statusCode: 200, headers, body: JSON.stringify(users) }
    }

    if (action === 'generateInvite' && event.httpMethod === 'POST') {
      // Create a unique invite link for an admin
      const token = new ObjectId().toString()
      await db.collection('invites').insertOne({
        admin_id: uid,
        token: token,
        created_at: new Date()
      })
      return { statusCode: 200, headers, body: JSON.stringify({ token }) }
    }

    if (action === 'joinAdmin' && event.httpMethod === 'POST') {
      const { token } = body
      const invite = await db.collection('invites').findOne({ token })
      if (!invite) throw new Error('Invalid invite link')
      
      await db.collection('user_links').updateOne(
        { user_id: uid, admin_id: invite.admin_id },
        { $set: { user_id: uid, admin_id: invite.admin_id, active: true, notifications_enabled: true } },
        { upsert: true }
      )
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'deleteAccount' && event.httpMethod === 'DELETE') {
      // Remove all data associated with user
      await db.collection('users').deleteOne({ id: uid })
      await db.collection('tasks').deleteMany({ user_id: uid })
      await db.collection('user_links').deleteMany({ user_id: uid })
      await db.collection('push_subscriptions').deleteMany({ user_id: uid })
      // Optionally remove from firebase auth directly if using Admin SDK for auth
      try {
        await admin.auth().deleteUser(uid)
      } catch (err) {
        console.error("Firebase auth deletion failed:", err)
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'upsertSubscription' && event.httpMethod === 'POST') {
      const { user_id, endpoint, keys } = body
      if (user_id !== uid) throw new Error('Unauthorized')

      await db.collection('push_subscriptions').updateOne(
        { endpoint },
        { $set: { user_id, endpoint, keys, updated_at: new Date() } },
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
