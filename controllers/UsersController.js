// App controller for express router
import sha1 from 'sha1';
import dbClient from '../utils/db';

/**
 * Handles express server `/users` endpoint.
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

    // respnd with id & email of created user
    res.status(201).send({ id: result.insertedId, email });
  }
}

export default UsersController;
