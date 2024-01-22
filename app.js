const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const app = express()
app.use(express.json())

const intialDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server Running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}

intialDBAndServer()

const convertDBStateToResponseObject = data => {
  return {
    stateId: data.state_id,
    stateName: data.state_name,
    population: data.population,
  }
}

const convertDBDistrictToResponseObject = data => {
  return {
    districtId: data.district_id,
    districtName: data.district_name,
    stateId: data.state_id,
    cases: data.cases,
    cured: data.cured,
    active: data.active,
    deaths: data.deaths,
  }
}

const authenticateUser = (request, response, next) => {
  const authHeader = request.headers['authorization']
  let jwtToken
  
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'THE_SECRET', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
      }
    })
  }
}

// CREATE NEW ACCOUNT

app.post('/login/', async (request, response) => {
  const {username, password} = request.body

  const getSpecificUser = `
  SELECT 
    * 
  FROM 
    user 
  WHERE 
    username = "${username}";`

  const specificUser = await db.get(getSpecificUser)

  if (specificUser !== undefined) {
    const isCorrectPassword = await bcrypt.compare(
      password,
      specificUser.password,
    )

    if (isCorrectPassword) {
      const jwtToken = jwt.sign(username, 'THE_SECRET')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

// GET STATES LIST

app.get('/states/', authenticateUser, async (request, response) => {
  const getStatesList = `
    SELECT 
    * 
    FROM 
    state;`

  const statesList = await db.all(getStatesList)

  response.send(
    statesList.map(eachObject => convertDBStateToResponseObject(eachObject)),
  )
})

// GET SPECIFIC STATE

app.get('/states/:stateId/', authenticateUser, async (request, response) => {
  const {stateId} = request.params

  const getSpecificState = `
    SELECT 
      * 
    FROM 
      state
    WHERE
      state_id = ${stateId};`

  const specificState = await db.get(getSpecificState)

  response.send(convertDBStateToResponseObject(specificState))
})

// CREATE NEW DISTRICT

app.post('/districts/', authenticateUser, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body

  const postNewDistrict = `
    INSERT INTO  
      district
        (district_name, state_id, cases, cured, active, deaths)
    VALUES
      ("${districtName}", ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});`

  await db.run(postNewDistrict)

  response.send('District Successfully Added')
})

// GET SPECIFIC DISTRICT

app.get(
  '/districts/:districtId',
  authenticateUser,
  async (request, response) => {
    const {districtId} = request.params

    const getSpecificDisctrict = `
    SELECT 
      * 
    FROM 
      district 
    WHERE 
      district_id = ${districtId};`

    const specificDistrict = await db.get(getSpecificDisctrict)

    response.send(convertDBDistrictToResponseObject(specificDistrict))
  },
)

// DELETE SPECIFIC DISTRICT

app.delete(
  '/districts/:districtId',
  authenticateUser,
  async (request, response) => {
    const {districtId} = request.params

    const deleteSpecificDisctrict = `
    DELETE FROM 
      district 
    WHERE 
      district_id = ${districtId};`

    await db.run(deleteSpecificDisctrict)

    response.send('District Removed')
  },
)

// UPDATE EXIST DISTRICT

app.put(
  '/districts/:districtId/',
  authenticateUser,
  async (request, response) => {
    const {districtId} = request.params

    const {districtName, stateId, cases, cured, active, deaths} = request.body

    const putExistDistrict = `
    UPDATE  
      district
    SET 
      district_name = "${districtName}",
      state_id = ${stateId},
      cases = ${cases},
      cured = ${cured},
      active = ${active},
      deaths = ${deaths}
    WHERE 
      district_id = ${districtId};`

    await db.run(putExistDistrict)

    response.send('District Details Updated')
  },
)

// GET STATISTICS OF SPECIFIC STATE

app.get(
  '/states/:stateId/stats',
  authenticateUser,
  async (request, response) => {
    const {stateId} = request.params

    const getSpecificStateStats = `
    SELECT 
      SUM(cases),
      SUM(cured),
      SUM(active),
      SUM(deaths)
    FROM 
      district
    WHERE
      state_id = ${stateId};`

    const stats = await db.get(getSpecificStateStats)

    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)

// GET SPECIFIC STATE NAME BY DISTRICT ID

app.get(
  '/districts/:districtId/details',
  authenticateUser,
  async (request, response) => {
    const {districtId} = request.params

    const getStateId = `
  SELECT 
    state_id 
  FROM 
    district
  WHERE 
    district_id = ${districtId}`

    const specificStateId = await db.get(getStateId)

    const getSpecificStateName = `
    SELECT 
      state_name as stateName
    FROM 
      state
    WHERE 
      state_id = ${specificStateId.state_id};`

    const specificStateName = await db.get(getSpecificStateName)

    response.send(specificStateName)
  },
)

module.exports = app;
