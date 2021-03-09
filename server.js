const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const cors = require('cors')
require('dotenv').config()
const mongoose = require('mongoose')
const { Schema } = mongoose
var ObjectId = require('mongoose').Types.ObjectId;
app.use(bodyParser.urlencoded({ extended: false }))

//Schema and Model
const fitPersonSchema = new Schema({
  username: { type: String, required: true },
  log: { type: [{ description: String, duration: Number, date: Date }], default: [] }
})

const FITPERSON = mongoose.model('fitPerson', fitPersonSchema);

//Db Connect
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });
/* mongoose.set('debug', true); */

//Serve Html
app.use(cors())
app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

//Create New User 
app.post("/api/exercise/new-user", function (req, res) {
  //check if username is blank
  if (req.body.username.trim().length === 0) {
    //if blank
    res.send('Username is required')
  } else {
    //if not blank
    //check if username exists
    FITPERSON.findOne({ username: req.body.username }, function (err, data) {
      if (err) {
        console.log(err);
        return err
      } else {
        if (data) {
          //if username exists
          res.send('Username already taken')
        } else {
          //if username doesn't exists
          //create user
          const fitPerson = new FITPERSON({ username: req.body.username })
          //save and return username and id
          fitPerson.save(function (err, data) {
            if (err) {
              console.log(err)
              res.json({ error: "There was an error, please check console" })
            } else {
              res.json({ _id: data._id, username: data.username })
            }
          })
        }
      }
    })
  }
})

//Get All Users
app.get('/api/exercise/users', function (req, res) {
  let users = FITPERSON.find({});
  let strippedUsers = users.select({ _id: 1, username: 1 })
  strippedUsers.exec(function (err, data) {
    if (err) {
      return err
    } else {
      res.send(data)
    }
  });
})

//Add exercise
app.post('/api/exercise/add', function (req, res) {
  //check form data
  if (req.body.userId.trim().length === 0 || req.body.description.trim().length === 0 || isNaN(req.body.duration)) {
    //if form data invalid
    res.send('Invalid data entry')
  } else {
    //if form data valid
    //find and update user
    FITPERSON.findOneAndUpdate({ _id: new ObjectId(req.body.userId) }, { $push: { log: { description: req.body.description, duration: req.body.duration, date: isNaN(new Date(req.body.date).getTime()) ? new Date() : new Date(req.body.date) } } }, { new: true }, function (err, data) {
      if (err) {
        console.log(err)
        res.send("Error please check console")
        return
      } else {
        //if data is null then user doesn't exist. else return latest exercise
        if (data === null) {
          res.send("User doesn't exist")
        } else {
          let date = data.log[data.log.length - 1].date.toDateString()
          let duration = data.log[data.log.length - 1].duration
          let description = data.log[data.log.length - 1].description
          res.json({ _id: data._id, username: data.username, date: date, duration: duration, description: description })
        }
      }
    })
  }
})

//Get log
app.get('/api/exercise/log', function (req, res) {
  try {
    const userId = new ObjectId(req.query.userId);
    const fromDate = req.query.from;
    const toDate = req.query.to;
    const limit = Number(req.query.limit);
    //check if date is valid
    if ((fromDate && isNaN(new Date(fromDate).getTime())) || (toDate && isNaN(new Date(toDate).getTime()))) {
      res.send("Invalid Time")
      return;
    }
    //check if limit is valid
    if (limit && isNaN(limit)) {
      res.send("Invalid Limit")
      return;
    }
    let logFilter = {};
    if (fromDate && toDate) {
      logFilter = {
        $filter: {
          input: "$log", as: "entry", cond: {
            $and: [{ $gte: ["$$entry.date", new Date(fromDate)] },
            { $lt: ["$$entry.date", new Date(toDate)] }]
          }
        }
      }
    } else if (fromDate && !toDate) {
      logFilter = {
        $filter: {
          input: "$log", as: "entry", cond: {
            $gte: ["$$entry.date", new Date(fromDate)]
          }
        }
      }
    } else if (toDate && !fromDate) {
      logFilter = {
        $filter: {
          input: "$log", as: "entry", cond: {
            $lt: ["$$entry.date", new Date(toDate)]
          }
        }
      }
    }
    let filterActive = Object.keys(logFilter).length > 0;
    //Queries
 
    if (filterActive && limit) {
      //if there is either time filter and limit
      const doc = FITPERSON.aggregate([{ $match: { _id: userId } },
      //This $project aggregation filters the log according to dates
      {
        $project: {
          log: logFilter,
          username: 1,
        }
      },
      //This $project aggregation slices the Log array according to user limit
      {
        $project: {
          log: {
            $slice: ["$log", limit]
          },
          username: 1,
        }
      },
      //This $project aggregation counts the number of items in Log array
      {
        $project: {
          username: 1,
          log: 1,
          count: { $size: "$log" }
        }
      }
      ], function (err, data) {
        if (err) {
          console.log(err)
          return
        } else {
          //Return data
          if (data) {
            res.send(data[0])
          }else{
            res.send("User doesn't exist")
          }
        }
      })
    } else if (filterActive && !limit) {
      //if there is either time filter but no limit
      const doc = FITPERSON.aggregate([{ $match: { _id: userId } },
      //This $project aggregation filters the log according to dates
      {
        $project: {
          log: logFilter,
          username: 1,
        }
      },
      //This $project aggregation counts the number of items in Log array
      {
        $project: {
          username: 1,
          log: 1,
          count: { $size: "$log" }
        }
      }
      ], function (err, data) {
        if (err) {
          console.log(err)
          return
        } else {
          //Return data
          if (data) {
            res.send(data[0])
          }else{
            res.send("User doesn't exist")
          }
        }
      })
    } else if (!filterActive && limit) {
      //if there is no time filter but limit
      const doc = FITPERSON.aggregate([{ $match: { _id: userId } },
      //This $project aggregation slices the Log array according to user limit
      {
        $project: {
          log: {
            $slice: ["$log", limit]
          },
          username: 1,
        }
      },
      //This $project aggregation counts the number of items in Log array
      {
        $project: {
          username: 1,
          log: 1,
          count: { $size: "$log" }
        }
      }
      ], function (err, data) {
        if (err) {
          console.log(err)
          return
        } else {
          //Return data
          if (data) {
            res.send(data[0])
          }else{
            res.send("User doesn't exist")
          }
        }
      })
    } else {
      const doc = FITPERSON.aggregate([{ $match: { _id: userId } },
      //This aggregation only counts the items in log 
      {
        $project: {
          username: 1,
          log: 1,
          count: { $size: "$log" }
        }
      }
      ], function (err, data) {
        if (err) {
          console.log(err)
          return
        } else {
          //Return data
          if (data) {
            res.send(data[0])
          }else{
            res.send("User doesn't exist")
          }
        }
      })
    }

    //test block
    /*  var date = new Date().toISOString(); */
    //
    //write out queries
    /*  let users = FITPERSON.find({ _id: userId }) */
    //let strippedUser = users.select({ _id: 1, username: 1 })
    //let userLogs = users.select({log : 1})
    /* let sortLogs = users.where('log.date').gte(date)
    sortLogs.exec(function (err, data) {
      if (err) {
        return err
      } else {
        console.log(data)
        console.log(data[0].log[0].date > new Date('Mon, 08 Mar 2021 00:00:00 GMT'))
      }
    }) */
  } catch (err) {
    console.log(err)
    res.send("Invalid user id");
  }

})

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
