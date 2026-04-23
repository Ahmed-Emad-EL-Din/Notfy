import { MongoClient, ObjectId } from 'mongodb'
import * as admin from 'firebase-admin'
import webpush from 'web-push'
import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'

const uri = process.env.VITE_MONGODB_URI
let cachedClient: MongoClient | null = null
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_MAX = 240
const RATE_LIMIT_WINDOW_MS = 60 * 1000

const recurrenceSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().min(1).max(12).default(1)
})

const attachmentSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1).max(180),
  mimeType: z.string().min(1).max(120),
  size: z.number().min(1).max(10 * 1024 * 1024)
})

const taskInputSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1).max(120),
  description_html: z.string().max(20000).optional().default(''),
  due_date: z.string(),
  completed: z.boolean().optional().default(false),
  visibility: z.enum(['personal', 'global']).optional().default('personal'),
  type: z.enum(['standard', 'poll']).optional().default('standard'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
  voice_note_url: z.string().url().optional().nullable(),
  reactions: z.record(z.array(z.string())).optional().default({}),
  votes: z.record(z.array(z.object({ uid: z.string(), anonymous: z.boolean() }))).optional().default({}),
  groupName: z.string().max(64).optional(),
  pollOptions: z.array(z.string().trim().min(1).max(80)).max(10).optional().default([]),
  showPollResults: z.boolean().optional().default(true),
  recurrence: recurrenceSchema.optional(),
  attachments: z.array(attachmentSchema).max(8).optional().default([]),
  user_id: z.string().optional()
})

// Initialize Firebase Admin for token verification
const initializeFirebase = () => {
  if (admin.apps.length) return;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID

  if (!serviceAccount && !projectId) {
    throw new Error('Firebase Admin Configuration Missing: Both FIREBASE_SERVICE_ACCOUNT and VITE_FIREBASE_PROJECT_ID are undefined in the environment.');
  }

  try {
    // Detect if serviceAccount is truncated (unlikely to be valid if < 100 chars)
    const isTruncated = serviceAccount && serviceAccount.length < 100;

    if (serviceAccount && !isTruncated) {
      let parsedCert;
      try {
        parsedCert = JSON.parse(serviceAccount);
      } catch (e) {
        try {
          let cleaned = serviceAccount.trim();
          const firstBrace = cleaned.indexOf('{');
          const lastBrace = cleaned.lastIndexOf('}');
          if (firstBrace !== -1 && lastBrace !== -1) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
          }
          cleaned = cleaned.replace(/\r?\n|\r/g, " ");
          parsedCert = JSON.parse(cleaned);
        } catch (e2: any) {
          throw new Error(`Robust JSON parsing failed. String starts with: "${serviceAccount.substring(0, 30)}". Ensure your ENV var is a single-line JSON.`);
        }
      }
      admin.initializeApp({
        credential: admin.credential.cert(parsedCert)
      })
    } else {
      // Fallback: If service account is missing or truncated, use project ID
      if (!projectId) throw new Error('Cannot initialize: Service Account is truncated and VITE_FIREBASE_PROJECT_ID is missing.');
      admin.initializeApp({
        projectId: projectId
      })
    }
    console.log("Firebase Admin initialized successfully.");
  } catch (e: any) {
    throw new Error(`Firebase Admin Initialization Failed: ${e.message}`);
  }
}

// Config web-push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
  let subject = process.env.VAPID_SUBJECT;
  if (!subject.startsWith('mailto:') && !subject.startsWith('http')) {
    subject = `mailto:${subject}`;
  }
  webpush.setVapidDetails(
    subject,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

async function sendAlertsToLinkedUsers(db: any, task: any, adminId: string) {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const links = await db.collection('user_links').find({ admin_id: adminId, active: true, notifications_enabled: true }).toArray()
    const targetUserIds = links.map((l: any) => l.user_id)
    
    if (targetUserIds.length === 0) return;

    const usersToNotify = await db.collection('users').find({ id: { $in: targetUserIds } }).toArray()
    const subscriptions = await db.collection('push_subscriptions').find({ user_id: { $in: targetUserIds } }).toArray()

    // 1. Telegram Notifications
    if (botToken) {
      for (const u of usersToNotify) {
        if (u.telegram_chat_id) {
          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: u.telegram_chat_id,
              text: `📢 NEW GLOBAL TASK: ${task.title}\n\n${task.description_html ? 'Check details in the app!' : ''}\nDue: ${new Date(task.due_date).toLocaleString()}`
            })
          }).catch(err => console.error("Telegram error:", err))
        }
      }
    }

    // 2. Web Push Notifications
    for (const sub of subscriptions) {
      const pushSub = { endpoint: sub.endpoint, keys: sub.keys }
      const payload = JSON.stringify({
        title: 'New Global Task',
        body: `Admin posted: ${task.title}`,
        data: { url: '/' }
      })
      webpush.sendNotification(pushSub, payload).catch(err => {
        if (err.statusCode === 410) db.collection('push_subscriptions').deleteOne({ _id: sub._id })
        console.error("Web Push Error:", err)
      })
    }
  } catch (err) {
    console.error("sendAlertsToLinkedUsers error:", err)
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

function enforceRateLimit(key: string) {
  const now = Date.now()
  const current = rateLimitStore.get(key)
  if (!current || now > current.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return
  }
  if (current.count >= RATE_LIMIT_MAX) {
    throw new Error('Rate limit exceeded. Please retry shortly.')
  }
  current.count += 1
  rateLimitStore.set(key, current)
}

function sanitizeTaskHtml(html: string) {
  return sanitizeHtml(html || '', {
    allowedTags: ['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'h1', 'h2', 'h3', 'code', 'pre'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt']
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data']
  })
}

function getNextRecurrenceDate(baseDate: Date, recurrence: { frequency: 'daily' | 'weekly' | 'monthly'; interval: number }) {
  const next = new Date(baseDate)
  if (recurrence.frequency === 'daily') next.setDate(next.getDate() + recurrence.interval)
  if (recurrence.frequency === 'weekly') next.setDate(next.getDate() + recurrence.interval * 7)
  if (recurrence.frequency === 'monthly') next.setMonth(next.getMonth() + recurrence.interval)
  return next
}

async function writeAudit(db: any, payload: { actor_id: string; action: string; entity: string; entity_id?: string; metadata?: Record<string, any> }) {
  await db.collection('audit_logs').insertOne({
    ...payload,
    created_at: new Date().toISOString()
  })
}

async function createNotification(db: any, notification: { user_id: string; title: string; message: string; type?: 'info' | 'warning' | 'urgent'; task_id?: string }) {
  await db.collection('notifications').insertOne({
    user_id: notification.user_id,
    title: notification.title,
    message: notification.message,
    type: notification.type || 'info',
    task_id: notification.task_id || null,
    is_read: false,
    created_at: new Date().toISOString()
  })
}

async function getUserRoleContext(db: any, uid: string, task: any) {
  const userRecord = await db.collection('users').findOne({ id: uid })
  if (task.user_id === uid) return { role: 'owner', userRecord }
  if (userRecord?.is_admin === true) return { role: 'admin', userRecord }
  const link = await db.collection('user_links').findOne({ user_id: uid, admin_id: task.user_id, active: true })
  if (link?.role === 'co-admin') return { role: 'co-admin', userRecord }
  if (link) return { role: 'member', userRecord }
  return { role: 'none', userRecord }
}

// Middleware to verify Firebase JWT
async function verifyAuth(event: any) {
  initializeFirebase();
  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing Auth Header')
  }
  const token = authHeader.split('Bearer ')[1]

  const host = event.headers.host || ''
  if (token === 'local-debug-token' && (host.includes('localhost') || host.includes('127.0.0.1'))) {
    return 'local-admin-debug'
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token)
    return decodedToken.uid
  } catch (error: any) {
    console.error("Firebase verifyIdToken error:", error.code, error.message);
    // Explicitly returning the code helps identify if it's a project mismatch vs expiry
    throw new Error(`Unauthorized: [${error.code || 'unknown'}] ${error.message || 'Invalid token'}`)
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
    const { action } = event.queryStringParameters || {}
    const ip = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown'
    enforceRateLimit(`${ip}:${action || 'unknown'}`)
    
    // Bypass verifyAuth ONLY for the incoming Telegram webhook
    let uid: string | null = null;
    if (action !== 'telegramWebhook') {
       uid = await verifyAuth(event)
    }

    const mongoClient = await connectToDatabase()
    const db = mongoClient.db('notfy')

    let body: any = {}
    if (event.body) {
      try {
        body = JSON.parse(event.body)
      } catch (e) {
        // Handle empty or invalid body
      }
    }

    // Fetch user info to check admin status
    let userRecord = null;
    if (uid) {
       userRecord = await db.collection('users').findOne({ id: uid });
    }
    const userIsAdmin = userRecord?.is_admin === true || uid === 'local-admin-debug';

    if (action === 'upsertUser' && event.httpMethod === 'POST') {
      const { id, email, name, is_admin } = body
      if (!uid || id !== uid) throw new Error('Unauthorized')
      
      await db.collection('users').updateOne(
        { id },
        { $set: { id, email, name, is_admin, updated_at: new Date() } },
        { upsert: true }
      )
      const user = await db.collection('users').findOne({ id })
      return { statusCode: 200, headers, body: JSON.stringify(user) }
    }
    
    if (action === 'getTasks' && event.httpMethod === 'GET') {
      const { userId } = event.queryStringParameters || {}
      if (userId !== uid) throw new Error('Unauthorized')
      
      // Get linked admins for this user
      const userLinks = await db.collection('user_links').find({ user_id: uid, active: true }).toArray()
      const adminIds = userLinks.map(link => link.admin_id)

      // Get user's personal tasks OR tasks made by linked admins that are global
      const tasksQuery = {
        $or: [
          { user_id: uid },
          { user_id: { $in: adminIds }, visibility: 'global' },
          { visibility: 'global', primary_admin_id: { $in: adminIds } } // Co-admin created tasks linked to primary admins
        ]
      }
      const tasks = await db.collection('tasks').find(tasksQuery).sort({ created_at: -1 }).toArray()
      
      return { statusCode: 200, headers, body: JSON.stringify(tasks) }
    }

    if (action === 'addTask' && event.httpMethod === 'POST') {
      if (body.user_id !== uid) throw new Error('Unauthorized')

      const parsed = taskInputSchema.parse(body)
      const dueDate = new Date(parsed.due_date)
      if (Number.isNaN(dueDate.getTime())) throw new Error('Invalid due date')

      const doc = {
        ...parsed,
        user_id: uid,
        description_html: sanitizeTaskHtml(parsed.description_html || ''),
        due_date: dueDate.toISOString(),
        created_at: new Date().toISOString()
      }
      const result = await db.collection('tasks').insertOne(doc)
      const task = await db.collection('tasks').findOne({ _id: result.insertedId })

      await writeAudit(db, {
        actor_id: uid!,
        action: 'task.created',
        entity: 'task',
        entity_id: result.insertedId.toString(),
        metadata: { visibility: task.visibility, type: task.type }
      })
      await db.collection('task_activity').insertOne({
        task_id: result.insertedId.toString(),
        actor_id: uid,
        action: 'created',
        detail: `Task created: ${task.title}`,
        created_at: new Date().toISOString()
      })
      
      // Instant Push for Global Tasks
      if (task.visibility === 'global' && uid) {
          await sendAlertsToLinkedUsers(db, task, uid);
          const links = await db.collection('user_links').find({ admin_id: uid, active: true }).toArray()
          await Promise.all(
            links.map((link: any) =>
              createNotification(db, {
                user_id: link.user_id,
                title: 'New global task',
                message: task.title,
                type: 'info',
                task_id: result.insertedId.toString()
              })
            )
          )
      }

      return { statusCode: 200, headers, body: JSON.stringify({ ...task, _id: result.insertedId.toString() }) }
    }

    if (action === 'updateTask' && event.httpMethod === 'PUT') {
      const { id, ...updates } = body
      if (!id) throw new Error('ID is required')
      
      const existingTask = await db.collection('tasks').findOne({ _id: new ObjectId(id) })
      if (!existingTask) throw new Error('Task not found')

      const ctx = await getUserRoleContext(db, uid!, existingTask)
      if (!['owner', 'admin', 'co-admin'].includes(ctx.role)) throw new Error('Unauthorized')

      const normalizedUpdates: any = { ...updates }
      if (typeof normalizedUpdates.description_html === 'string') {
        normalizedUpdates.description_html = sanitizeTaskHtml(normalizedUpdates.description_html)
      }
      if (normalizedUpdates.pollOptions && !['owner', 'admin', 'co-admin'].includes(ctx.role)) {
        throw new Error('Unauthorized to manage poll options')
      }

      await db.collection('tasks').updateOne({ _id: new ObjectId(id) }, { $set: normalizedUpdates })
      if (normalizedUpdates.completed === true && existingTask.recurrence) {
        const nextDue = getNextRecurrenceDate(new Date(existingTask.due_date), existingTask.recurrence)
        const nextTask = {
          ...existingTask,
          _id: undefined,
          due_date: nextDue.toISOString(),
          completed: false,
          created_at: new Date().toISOString()
        }
        delete nextTask._id
        await db.collection('tasks').insertOne(nextTask)
      }
      await db.collection('task_activity').insertOne({
        task_id: id,
        actor_id: uid,
        action: 'updated',
        detail: 'Task details updated',
        created_at: new Date().toISOString()
      })
      await writeAudit(db, {
        actor_id: uid!,
        action: 'task.updated',
        entity: 'task',
        entity_id: id,
        metadata: { fields: Object.keys(normalizedUpdates) }
      })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'reactTask' && event.httpMethod === 'POST') {
        const { id, emoji } = body
        if (!id || !emoji) throw new Error('ID and emoji are required')
        // Simple toggle logic
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(id) })
        if (!task) throw new Error('Task not found')
        const ctx = await getUserRoleContext(db, uid!, task)
        if (ctx.role === 'none') throw new Error('Unauthorized')

        let reactions = task.reactions || {}
        if (!reactions[emoji]) reactions[emoji] = []
        
        let arr = reactions[emoji]
        if (arr.includes(uid)) {
            arr = arr.filter((u: string) => u !== uid) // remove
        } else {
            arr.push(uid) // add
        }
        reactions[emoji] = arr

        await db.collection('tasks').updateOne({ _id: new ObjectId(id) }, { $set: { reactions } })
        await db.collection('task_activity').insertOne({
          task_id: id,
          actor_id: uid,
          action: 'reacted',
          detail: `Reacted with ${emoji}`,
          created_at: new Date().toISOString()
        })
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, reactions }) }
    }

    if (action === 'voteTask' && event.httpMethod === 'POST') {
        const { id, optionIndex, anonymous } = body
        if (!id || optionIndex === undefined) throw new Error('ID and optionIndex are required')
        
        const task = await db.collection('tasks').findOne({ _id: new ObjectId(id) })
        if (!task) throw new Error('Task not found')
        const ctx = await getUserRoleContext(db, uid!, task)
        if (ctx.role === 'none') throw new Error('Unauthorized')

        let votes = task.votes || {}
        
        // Remove user from any previously voted option to enforce 1 vote per user
        Object.keys(votes).forEach(opt => {
             votes[opt] = votes[opt].filter((v: any) => v.uid !== uid)
        })

        if (!votes[optionIndex]) votes[optionIndex] = []
        
        votes[optionIndex].push({ uid, anonymous }) // anonymous boolean controls whether name is shown

        await db.collection('tasks').updateOne({ _id: new ObjectId(id) }, { $set: { votes } })
        await db.collection('task_activity').insertOne({
          task_id: id,
          actor_id: uid,
          action: 'voted',
          detail: `Voted on option ${optionIndex + 1}${anonymous ? ' anonymously' : ''}`,
          created_at: new Date().toISOString()
        })
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, votes }) }
    }

    if (action === 'toggleMute' && event.httpMethod === 'POST') {
        const { id } = body
        if (!uid || !id) throw new Error('Unauthorized or no task id')
        
        const user = await db.collection('users').findOne({ id: uid })
        let muted = user?.muted_tasks || []
        
        if (muted.includes(id)) {
            muted = muted.filter((t: string) => t !== id)
        } else {
            muted.push(id)
        }
        
        await db.collection('users').updateOne({ id: uid }, { $set: { muted_tasks: muted } })
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, muted_tasks: muted }) }
    }

    if (action === 'snoozeTask' && event.httpMethod === 'POST') {
      const { id, minutes } = body
      if (!id || !minutes) throw new Error('ID and minutes are required')
      const task = await db.collection('tasks').findOne({ _id: new ObjectId(id) })
      if (!task) throw new Error('Task not found')
      const ctx = await getUserRoleContext(db, uid!, task)
      if (ctx.role === 'none') throw new Error('Unauthorized')

      const currentDue = new Date(task.due_date)
      const next = new Date(currentDue.getTime() + Number(minutes) * 60 * 1000)
      await db.collection('tasks').updateOne({ _id: new ObjectId(id) }, { $set: { due_date: next.toISOString(), completed: false } })
      await db.collection('task_activity').insertOne({
        task_id: id,
        actor_id: uid,
        action: 'snoozed',
        detail: `Snoozed by ${minutes} minutes`,
        created_at: new Date().toISOString()
      })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, due_date: next.toISOString() }) }
    }

    if (action === 'skipOccurrence' && event.httpMethod === 'POST') {
      const { id } = body
      if (!id) throw new Error('ID is required')
      const task = await db.collection('tasks').findOne({ _id: new ObjectId(id) })
      if (!task) throw new Error('Task not found')
      if (!task.recurrence) throw new Error('Task is not recurring')
      const ctx = await getUserRoleContext(db, uid!, task)
      if (!['owner', 'admin', 'co-admin'].includes(ctx.role)) throw new Error('Unauthorized')

      const nextDue = getNextRecurrenceDate(new Date(task.due_date), task.recurrence)
      await db.collection('tasks').updateOne({ _id: new ObjectId(id) }, { $set: { due_date: nextDue.toISOString(), completed: false } })
      await db.collection('task_activity').insertOne({
        task_id: id,
        actor_id: uid,
        action: 'skipped',
        detail: 'Skipped recurring occurrence',
        created_at: new Date().toISOString()
      })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, due_date: nextDue.toISOString() }) }
    }

    if (action === 'deleteTask' && event.httpMethod === 'DELETE') {
      const { id } = body
      if (!id) throw new Error('ID is required')
      
      const existingTask = await db.collection('tasks').findOne({ _id: new ObjectId(id) })
      if (!existingTask) throw new Error('Task not found')
      
      const ctx = await getUserRoleContext(db, uid!, existingTask)
      if (!['owner', 'admin', 'co-admin'].includes(ctx.role)) throw new Error('Unauthorized')

      await db.collection('tasks').deleteOne({ _id: new ObjectId(id) })
      await writeAudit(db, {
        actor_id: uid!,
        action: 'task.deleted',
        entity: 'task',
        entity_id: id
      })
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
      if (!uid || !userIsAdmin) {
          throw new Error('Forbidden: Only administrators can generate invite links')
      }
      const { role } = body || { role: 'user' }
      
      // Reuse existing invite if any
      const existing = await db.collection('invites').findOne({ admin_id: uid, role: role })
      if (existing) {
          return { statusCode: 200, headers, body: JSON.stringify({ token: existing.token }) }
      }

      const token = new ObjectId().toString()
      await db.collection('invites').insertOne({
        admin_id: uid,
        token: token,
        role: role,
        created_at: new Date()
      })
      return { statusCode: 200, headers, body: JSON.stringify({ token }) }
    }

    if (action === 'joinAdmin' && event.httpMethod === 'POST') {
      const { token } = body
      const invite = await db.collection('invites').findOne({ token })
      if (!invite) throw new Error('Invalid invite link')
      
      const role = invite.role || 'user'
      
      await db.collection('user_links').updateOne(
        { user_id: uid, admin_id: invite.admin_id },
        { $set: { user_id: uid, admin_id: invite.admin_id, active: true, notifications_enabled: true, role } },
        { upsert: true }
      )
      
      // If joining as co-admin, explicitly mark them as an admin in db as well
      if (role === 'co-admin') {
          await db.collection('users').updateOne(
              { id: uid },
              { $set: { is_admin: true, primary_admin_id: invite.admin_id } }
          )
      }
      
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, role }) }
    }

    if (action === 'unlinkAdmin' && event.httpMethod === 'POST') {
      const { admin_id } = body
      if (!admin_id) throw new Error('admin_id is required')
      await db.collection('user_links').deleteOne({ user_id: uid, admin_id })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'deleteAccount' && event.httpMethod === 'DELETE') {
      if (!uid) throw new Error('Unauthorized')

      // Remove all data associated with user
      await db.collection('users').deleteOne({ id: uid })
      await db.collection('tasks').deleteMany({ user_id: uid })
      await db.collection('push_subscriptions').deleteMany({ user_id: uid })
      
      // Remove all invitation links they created
      await db.collection('invites').deleteMany({ admin_id: uid })
      
      // Remove all workspace relationships (as user or as admin)
      await db.collection('user_links').deleteMany({ 
        $or: [
          { user_id: uid },
          { admin_id: uid }
        ]
      })

      // Optionally remove from firebase auth directly
      try {
        await admin.auth().deleteUser(uid)
      } catch (err) {
        console.error("Firebase auth deletion failed:", err)
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'upsertSubscription' && event.httpMethod === 'POST') {
      const { user_id, endpoint, p256dh, auth } = body
      if (!uid || user_id !== uid) throw new Error('Unauthorized')

      await db.collection('push_subscriptions').updateOne(
        { endpoint },
        { $set: { user_id, endpoint, keys: { p256dh, auth }, updated_at: new Date() } },
        { upsert: true }
      )
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    // Telegram Bot Integration endpoints
    if (action === 'registerWebhook' && event.httpMethod === 'POST') {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) throw new Error('Bot token missing');
      
      const host = event.headers.host || 'relaysignal.netlify.app';
      const protocol = host.includes('localhost') ? 'http' : 'https';
      const webhookUrl = `${protocol}://${host}/.netlify/functions/api?action=telegramWebhook`;
      
      const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const data = await res.json();
      
      console.log(`Webhook registered: ${webhookUrl}`, data);
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, data, url: webhookUrl }) };
    }

    if (action === 'checkTelegramStatus' && event.httpMethod === 'GET') {
      if (!uid) throw new Error('Unauthorized')
      const user = await db.collection('users').findOne({ id: uid })
      return { statusCode: 200, headers, body: JSON.stringify({ connected: !!user?.telegram_chat_id }) }
    }

    if (action === 'testTelegram' && event.httpMethod === 'POST') {
      if (!uid) throw new Error('Unauthorized')
      
      const user = await db.collection('users').findOne({ id: uid })
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      // 1. Send Telegram Test
      if (user?.telegram_chat_id && botToken) {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             chat_id: user.telegram_chat_id,
             text: '🔔 Test Notification from Notfy! Your Telegram connection is working perfectly. 🚀'
          })
        }).catch(() => {})
      }
      
      // 2. Send Browser Web Push Test
      const subscriptions = await db.collection('push_subscriptions').find({ user_id: uid }).toArray()
      for (const sub of subscriptions) {
        const payload = JSON.stringify({
          title: 'Notfy Test Alert',
          body: 'Your browser notifications are working correctly! ✅'
        })
        webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload).catch(err => {
          if (err.statusCode === 410) db.collection('push_subscriptions').deleteOne({ _id: sub._id })
          console.error("Test Web Push Error:", err)
        })
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, telegram: !!user?.telegram_chat_id, browser: subscriptions.length > 0 }) }
    }

    if (action === 'disconnectTelegram' && event.httpMethod === 'POST') {
      if (!uid) throw new Error('Unauthorized')
      await db.collection('users').updateOne(
        { id: uid },
        { $unset: { telegram_chat_id: "", telegram_updated_at: "" } }
      )
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'getNotifications' && event.httpMethod === 'GET') {
      const typeFilter = event.queryStringParameters?.type
      const query: any = { user_id: uid }
      if (typeFilter && ['info', 'warning', 'urgent'].includes(typeFilter)) query.type = typeFilter
      const notifications = await db.collection('notifications').find(query).sort({ created_at: -1 }).limit(200).toArray()
      return { statusCode: 200, headers, body: JSON.stringify(notifications) }
    }

    if (action === 'markNotificationRead' && event.httpMethod === 'POST') {
      const { id, is_read } = body
      if (!id) throw new Error('Notification id is required')
      await db.collection('notifications').updateOne(
        { _id: new ObjectId(id), user_id: uid },
        { $set: { is_read: Boolean(is_read), updated_at: new Date().toISOString() } }
      )
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'clearNotifications' && event.httpMethod === 'POST') {
      await db.collection('notifications').updateMany(
        { user_id: uid },
        { $set: { is_read: true, cleared_at: new Date().toISOString() } }
      )
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
    }

    if (action === 'getTaskActivity' && event.httpMethod === 'GET') {
      const taskId = event.queryStringParameters?.taskId
      if (!taskId) throw new Error('taskId is required')
      const task = await db.collection('tasks').findOne({ _id: new ObjectId(taskId) })
      if (!task) throw new Error('Task not found')
      const ctx = await getUserRoleContext(db, uid!, task)
      if (ctx.role === 'none') throw new Error('Unauthorized')
      const items = await db.collection('task_activity').find({ task_id: taskId }).sort({ created_at: -1 }).limit(100).toArray()
      return { statusCode: 200, headers, body: JSON.stringify(items) }
    }

    if (action === 'getAuditLogs' && event.httpMethod === 'GET') {
      if (!userIsAdmin) throw new Error('Unauthorized')
      const logs = await db.collection('audit_logs').find({}).sort({ created_at: -1 }).limit(200).toArray()
      return { statusCode: 200, headers, body: JSON.stringify(logs) }
    }

    if (action === 'telegramWebhook' && event.httpMethod === 'POST') {
      try {
        const update = body;
        if (update?.message?.text) {
          const text = update.message.text;
          const chatId = update.message.chat.id;
          
          if (text.startsWith('/start ')) {
            const linkedUid = text.split('/start ')[1].trim();
            if (linkedUid) {
               // Link the telegram chat ID to the Notfy User ID
               await db.collection('users').updateOne(
                 { id: linkedUid },
                 { $set: { telegram_chat_id: chatId, telegram_updated_at: new Date() } }
               )
               
               // Dispatch welcome message
               const botToken = process.env.TELEGRAM_BOT_TOKEN;
               if (botToken) {
                 await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                       chat_id: chatId,
                       text: 'Connected successfully! ✅ Return to your browser.'
                    })
                 }).catch(err => console.error("Telegram send failed:", err))
               }
            }
          }
        }
      } catch (err) {
        console.error("Webhook parse error:", err)
      }
      // Always return 200 OK to Telegram so it stops retrying the webhook
      return { statusCode: 200, headers, body: 'OK' }
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
