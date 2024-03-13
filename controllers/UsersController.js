// App controller for express router
import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const Bull = require('bull');
// create a queue named userQueue to handle
// logging welcome message (using worker.js)
const userQueue = new Bull('userQueue');

/**
 * Handles `/users` & `/users/me` endpoint.
 */
class UsersController {
  /**
   * Creates a new user in database.
   * @param {Request} req
   * @param {Response} res
   */
  static async postNew(req, res) {
    // check if email is passed in request body
    if (!req.body.email) {
      res.status(400).send({ error: 'Missing email' });
      return;
    }
    // check if password is passed in request body
    if (!req.body.password) {
      res.status(400).send({ error: 'Missing password' });
      return;
    }
    const { email, password } = req.body;
    // check if a user with same email already exists
    const sameUser = await dbClient.db.collection('users').findOne({ email });
    if (sameUser) {
      res.status(400).send({ error: 'Already exist' });
      return;
    }

    // hash the password in SHA1. (create hash, add data to hash, then digest)
    const hashedPassword = sha1(password);

    // add new user to db
    const newUser = { email, password: hashedPassword };
    const result = await dbClient.db.collection('users').insertOne(newUser);

    // add job to userQueue
    userQueue.add({ userId: result.insertedId });

    // respnd with id & email of created user
    res.status(201).send({ id: result.insertedId, email });
  }

  /**
   * Retrieve the user based on the token.
   * @param {Request} req
   * @param {Response} res
   */
  static async getMe(req, res) {
    // get token from X-Token header in request
    const token = req.get('X-Token');
    if (!token) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }

    const key = `auth_${token}`;
    // retrive user id from redis
    const userId = await redisClient.get(key);

    if (!userId) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    // retrieve user from db using user id
    const user = await dbClient.db.collection('users')
      .findOne({ _id: new ObjectId(userId) }); // convert userId(strint) to ObjectId
    if (!user) { // as precaution. (incase user_id is stored in redis but user not in db)
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }
    const { _id, email } = user;
    res.send({ id: _id.toString(), email });
  }
}

export default UsersController;
