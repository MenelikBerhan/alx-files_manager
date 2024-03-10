// Express server
import express from 'express';
import router from './routes/index';

const app = express();
// get port from env. If absent use default.
const port = process.env.PORT || 5000;

// for parsing application/json & populating req.body
app.use(express.json());
// use router in app
app.use('/', router);

// start server and notify if successful
app.listen(port, () => {
  console.log(`Started Express server listning on port ${port}`);
});
