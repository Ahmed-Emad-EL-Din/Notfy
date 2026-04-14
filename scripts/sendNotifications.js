import webpush from 'web-push'
import { MongoClient, ObjectId } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = process.env.VITE_MONGODB_URI
const VAPID_PUBLIC_KEY = process.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

if (!MONGODB_URI || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("Missing required environment variables.")
  process.exit(1)
}

webpush.setVapidDetails(
  'mailto:admin@notfy.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

async function run() {
  console.log("Connecting to MongoDB...")
  const client = new MongoClient(MONGODB_URI)
  await client.connect()
  const db = client.db('notfy')

  console.log("Checking for tasks due tomorrow...")
  
  // Calculate the start and end of tomorrow
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const endOfTomorrow = new Date(tomorrow)
  endOfTomorrow.setHours(23, 59, 59, 999)

  // Query MongoDB for pending tasks due tomorrow
  const tasks = await db.collection('tasks').find({
    completed: false,
    due_date: {
      $gte: tomorrow.toISOString(),
      $lte: endOfTomorrow.toISOString()
    }
  }).toArray()

  if (!tasks || tasks.length === 0) {
    console.log("No tasks due tomorrow.")
    await client.close()
    return
  }

  console.log(`Found ${tasks.length} tasks due tomorrow.`)

  // Group tasks by user_id
  const tasksByUser = tasks.reduce((acc, task) => {
    if (!acc[task.user_id]) acc[task.user_id] = []
    acc[task.user_id].push(task)
    return acc
  }, {})

  // For each user, send a notification
  for (const userId of Object.keys(tasksByUser)) {
    const userTasks = tasksByUser[userId]
    
    // Fetch push subscription from MongoDB
    const sub = await db.collection('push_subscriptions').findOne({ user_id: userId })

    if (!sub) {
      console.log(`No active push subscription for user ${userId}.`)
      continue
    }

    const payload = JSON.stringify({
      title: 'Task Due Tomorrow!',
      message: `You have ${userTasks.length} task(s) due tomorrow, including: "${userTasks[0].title}"`,
      url: '/'
    })

    const subscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth
      }
    }

    try {
      await webpush.sendNotification(subscription, payload)
      console.log(`Push notification sent successfully to user ${userId}`)
    } catch (pushError) {
      console.error(`Failed to send push to user ${userId}:`, pushError)
      // If error is 410 Gone, the subscription is no longer valid
      if (pushError.statusCode === 410 || pushError.statusCode === 404) {
        console.log("Subscription expired or removed, deleting from database...")
        await db.collection('push_subscriptions').deleteOne({ _id: sub._id })
      }
    }
  }

  await client.close()
}

run().then(() => {
  console.log("Job completed.")
  process.exit(0)
}).catch((err) => {
  console.error("Unexpected error:", err)
  process.exit(1)
})
