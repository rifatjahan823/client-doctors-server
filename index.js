const express = require('express');
const cors= require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

//midleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jwhbn04.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

 async function run(){
    try{
      await client.connect();
      const servicesCollection = client.db("doctros-portal").collection("services");
      const bookingCollection = client.db("doctros-portal").collection('bookings');
      const userCollection = client.db("doctros-portal").collection('users');
      const doctorsCollection = client.db("doctros-portal").collection('doctors');

/******verify JWT********/
function verifyJWT(req,res,next){
  const authHeader =req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message:'authorization'})
  }
  const token =authHeader.split(' ')[1];
  // verify a token symmetric
jwt.verify(token,process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
  if(err){
    return res.status(403).send({message:'Forbiden access'})
  }
  req.decoded=decoded;
  next();
});
}
/******verifyAddmin ********/
const verifyAdmin=async(req,res,next)=>{
  const requerster = req.decoded.email;
  const requersterAccount = await userCollection.findOne({email:requerster});
  if(requersterAccount.role==='admin'){
next();
  }else{
    res.status(403).send({message:"you are nont admin"})
  }
}

 /******get user information sent backend********/
 app.post('/users',async(req,res)=>{
  const user = req.body;
  const result = await userCollection.insertOne(user );
  res.send(result)
})
/******get all user********/
app.get('/user',async(req,res)=>{
  const user= await userCollection.find().toArray();
  res.send(user)
})
/******get all service********/
app.get('/services',async(req,res)=>{
  const query = {};
  const cursor =servicesCollection.find(query).project({name:1});
  const services = await cursor.toArray();
  res.send(services)
})

/******get add doctor-information from page dashbord/adddoctor information sent backend********/
app.post('/doctor',verifyJWT,verifyAdmin,async(req,res)=>{
  const doctor = req.body;
  const result = await doctorsCollection.insertOne(doctor);
  return res.send(result);
})

app.get('/doctor',verifyJWT,verifyAdmin,async(req,res)=>{
  const doctor = await doctorsCollection.find().toArray();
  res.send(doctor)
})
app.delete('/doctor/:email',verifyJWT,verifyAdmin,async(req,res)=>{
  const email = req.params.email;
  const query = {email:email}
  const result = await doctorsCollection.deleteOne(query);
  return res.send(result);
})


/******update user********/
app.put('/user/:email',async(req,res)=>{
  const email = req.params.email;
  const user = req.body;
  const filter = {email:email};
  const options = {upsert:true};
  const updateDoc = {
    $set:user,
  };
  const result = await userCollection.updateOne(filter, updateDoc, options);
   const token=jwt.sign({email:email},process.env.ACCESS_TOKEN_SECRET);
  res.send({result,token:token});
})
// //ADMIN ROLL
// app.put('/user/admin/:email',verifyJWT,verifyAdmin,async(req,res)=>{
//   const email = req.params.email;
//     const filter = {email:email};
//     const updateDoc = {
//       $set:{role:"admin"},
//     };
//     const result = await userCollection.updateOne(filter, updateDoc);
//     res.send(result);
 
// })
// app.get('/admin/:email',async(req,res)=>{
//   const email = req.params.email;
//   const user = await userCollection.findOne({email:email});
//   const isAdmin =user.role==='admin';
//   res.send({admin:isAdmin})
// })
//ADMIN ROLL
app.put('/verifyUsers',verifyAdmin,async(req,res)=>{
  const email = req.body.email;
  console.log(email)
    const filter = {email:email};
    const updateDoc = {
      $set:{role:"admin"},
    };
    const result = await userCollection.updateOne(filter, updateDoc);
    res.send(result);
 
})

 app.get('/admin',verifyAdmin, async(req,res)=>{
   const email = req.query.email;
   const user = await userCollection.findOne({email:email});
   const isAdmin =user.role==='admin';
   res.send({admin:isAdmin})
 })

/******get user booking information sent backend********/
app.post('/booking',async(req,res)=>{
  const booking = req.body;
  //for one time per catagory per day
  const query = {treatment:booking.treatment,date:booking.date,patientEmail:booking.patientEmail};
  const findOne =await bookingCollection.findOne(query);
  if(findOne){
    return res.send({success:false,booking:findOne});
  }
  const result = await bookingCollection.insertOne(booking);
  sendAppoinmentEmail(booking)
  return res.send({success:true,result});
})
/******get all booking********/
app.get('/allbooking',verifyJWT,async(req,res)=>{
  const booking= await  bookingCollection.find().toArray();
  res.send(booking)
})

/******show per user appoinment by email********/
app.get('/booking',verifyJWT,async(req,res)=>{
  const patientEmail = req.query.patientEmail;
  const decodedEmail = req.decoded.email;
  if(patientEmail===decodedEmail){
    const query ={patientEmail:patientEmail};
    const booking =await bookingCollection.find(query).toArray();
    return res.send(booking)
  }else{
    return res.status(403).send({message:'forbiden'})
  }
})

/******booking details by id per user********/
app.get('/booking/:id',verifyJWT,async(req,res)=>{
  const id= req.params.id;
  const query={_id:ObjectId(id)};
  const booking = await bookingCollection.findOne(query);
  res.send(booking)
})

/******remove available time if user booking it ********/
app.get('/available',async(req,res)=>{
  const date = req.query.date;
  //1.setp-1 get all services
  const services =await servicesCollection.find().toArray();
  //2.step-2 get booking date
  const query={date:date};
  const bookings = await bookingCollection.find(query).toArray();
  //3.setp-3 for each get all service and find bookings for that service
  services.forEach(service=>{
    serviceBookings = bookings.filter(b=>b.treatment===service.name);
    const booked = serviceBookings.map(b=>b.slot);
    const available=service.slots.filter(s=>!booked.includes(s) );
    service.slots= available;
  })
  res.send(services)
})

    }
    finally{

    }
}
run().catch(console.dir);



// GET method route
app.get('/', (req, res) => {
    res.send('GET request to the homepage')
  })
  

  app.listen(port, () => {
    console.log('POST request to the homepage')
  })