import { schedule } from '@netlify/functions'
import { MongoClient } from 'mongodb'
import webpush from 'web-push'

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

// Config web-push with VAPID keys if they exist in env
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
}

export const handler = schedule("@hourly", async (event) => {
  console.log("Running hourly push notification check...")
  
  if (!process.env.VAPID_PUBLIC_KEY) {
    console.log("No VAPID keys found, skipping push.")
    return { statusCode: 200 }
  }

  try {
    const client = await connectToDatabase()
    const db = client.db('notfy')

    // Find all tasks that are due in the next 24 hours and not completed
    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    
    // We only want to push tasks that are between now and tomorrow, and haven't been pushed already.
    // simpler logic: push tasks due tomorrow.
    const upcomingTasks = await db.collection('tasks').find({
        completed: false,
        due_date: {
            $gte: now.toISOString(),
            $lte: tomorrow.toISOString()
        }
    }).toArray()
    
    if (upcomingTasks.length === 0) {
        return { statusCode: 200 }
    }

    // Load subscriptions
    const subscriptions = await db.collection('push_subscriptions').find().toArray()

    const pushPromises = upcomingTasks.map(async (task) => {
        // Find subscriptions for the user who owns the task or for users linked to the admin (if global task)
        const targetUserIds = [task.user_id]
        if (task.visibility === 'global') {
             const links = await db.collection('user_links').find({ admin_id: task.user_id, active: true, notifications_enabled: true }).toArray()
             links.forEach(l => targetUserIds.push(l.user_id))
        }

        const targetSubs = subscriptions.filter(sub => targetUserIds.includes(sub.user_id))
        
        const payload = JSON.stringify({
            title: 'Task Reminder',
            body: `You have an upcoming task: ${task.title}`
        })

        return Promise.all(targetSubs.map(sub => {
            const pushSub = {
                endpoint: sub.endpoint,
                keys: sub.keys
            }
            return webpush.sendNotification(pushSub, payload)
              .catch(err => {
                 if (err.statusCode === 410) {
                     // Subscription expired or unsubscribed, remove from DB
                     db.collection('push_subscriptions').deleteOne({ _id: sub._id })
                 }
                 console.error("Push Error", err)
              })
        }))
    });

    await Promise.all(pushPromises)

    return { statusCode: 200 }
  } catch (error) {
    console.error("Cron Error", error)
    return { statusCode: 500 }
  }
})
