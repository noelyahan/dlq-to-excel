const writeXlsxFile = require('write-excel-file/node')
const { Kafka } = require('kafkajs')

let DLQ_TOPIC = 'services.mos.async-events-validator.dlq'
let KAFKA_BROKER = 'localhost:9092'

const kafka = new Kafka({
    clientId: 'my-app',
    brokers: [KAFKA_BROKER],
})

const schema = [
    {
        column: 'topic',
        width: 20,
        type: String,
        value: record => record.topic
    },
    {
        column: 'key',
        width: 60,
        type: String,
        value: record => record.key
    },
    {
        column: 'errors',
        width: 100,
        height: 50,
        wrap: true,
        type: String,
        value: record => record.errors
    },
    {
        column: 'timestamp',
        width: 60,
        type: String,
        value: record => record.timestamp
    },
    {
        column: 'serviceId',
        width: 60,
        type: String,
        value: record => record.serviceId
    },
    {
        column: 'type',
        width: 60,
        type: String,
        value: record => record.type
    },
    {
        column: 'partition',
        width: 10,
        type: Number,
        format: '#,##0',
        value: record => record.partition
    },
    {
        column: 'offset',
        width: 10,
        type: Number,
        format: '#,##0',
        value: record => record.offset
    },
    {
        column: 'accountId',
        width: 60,
        type: String,
        value: record => record.accountId
    }
]


/*
{
      topic: 'mos.budget.timeline.version',
      key: 'd2ff5c03-00e1-4c79-8eac-07d5387da819',
      partition: 23,
      offset: 745,
      errors: [Array],
      accountId: 'c61118e9-ae14-49c2-a09a-f7d00de3684a,c61118e9-ae14-49c2-a09a-f7d00de3684a,c61118e9-ae14-49c2-a09a-f7d00de3684a',
      serviceId: 'services.mos.budget-manager,services.mos.budget-manager,services.mos.budget-timeline-generator',
      type: 'BudgetChanged,BudgetChanged,TimelineVersionUpdated'
    }
* */
const objects = [
    {
        topic: 'mos.budget.timeline.version',
        key: '22864037-9ead-4da3-a8c3-76414a03477d',
        partition: 17,
        offset: 89,
        errors: 'schema subject ex: `com.mybudget.events.mos.account.XXXXXXX` not found for event type: [BudgetPreferenceChanged]\n' +
            'schema subject ex: `com.mybudget.events.mos.account.XXXXXXX` not found for event type: [BudgetPreferenceChanged]',
        accountId: 'c1451c49-bd05-4683-b0ee-8031bee6bb5f,c1451c49-bd05-4683-b0ee-8031bee6bb5f,c1451c49-bd05-4683-b0ee-8031bee6bb5f',
        serviceId: 'services.mos.budget-manager,services.mos.budget-manager,services.mos.budget-timeline-generator',
        type: 'BudgetPreferenceChanged,BudgetPreferenceChanged,TimelineVersionUpdated'
    }
]

async function saveAllSheets(data) {
    let topics = Object.keys(data)
    let dataArr = topics.map(t => data[t])
    let schemas = topics.map(e => schema)
    let sheets = topics.map(e => e.substr(0, 20))
    let res = await writeXlsxFile(dataArr, {
       headerStyle: {
            backgroundColor: '#ffc524',
            fontWeight: 'bold',
            align: 'center',
            fontSize: 11
        },
        schema: schemas,
        sheets: sheets,
        filePath: `./${topic}.xlsx`
    })
}

let data = []
for (let i = 0; i < 10; i++) {
    data.push(objects)
}
// saveAllSheets(data)
// return

let topicData = {}

async function consumeData(topic) {
    const consumer = kafka.consumer({groupId: `app-${+new Date()}`})

    await consumer.connect()
    await consumer.subscribe({topic: topic, fromBeginning: true})

    await consumer.run({
        eachMessage: async ({topic, partition, message}) => {

            let headers = {}
            let headerObject = {};
            Object.keys(message.headers).forEach(key => {
                let value = message.headers[key].toString()
                headers[key] = value
            })
            let account_id = headers['account_id']
            let service_id = headers['service_id']
            let type = headers['type']
            let trace = headers['__dlq_trace']
            let timestamp = headers['__dlq_timestamp']
            let meta = trace.substr(trace.indexOf("caused by: {")).replace("caused by:", "")
            let metaObject = {}
            if(meta) {
                metaObject = JSON.parse(meta)
                metaObject['timestamp'] = timestamp
                metaObject['accountId'] = account_id
                metaObject['serviceId'] = service_id
                metaObject['type'] = type
                let errs = metaObject['errors']
                let updatedErrs = errs.map((e, i) => `(${i+1}).` + e.split(' at ')[0])
                metaObject['errors'] = updatedErrs.join("\n")
            }

            let tp = metaObject['topic']
            if(!topicData[tp]) {
                topicData[tp] = []
            }
            topicData[tp].push(metaObject)
            return
        },
    })
}


// Consume and save file
let prevLength = 0;
let done = false
setInterval(() => {
    if(done) {
        return
    }
    let currLength = 0;
    Object.keys(topicData).forEach(e => {
        currLength += e.length
    })
    if(prevLength == currLength) {
        console.log('done!')
        done = true
        saveAllSheets(topicData)
    }
    prevLength = currLength
}, 5000)

consumeData(DLQ_TOPIC)



