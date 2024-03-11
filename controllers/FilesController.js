// Files controller for express router
// import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import fsClient from '../utils/fs';
import redisClient from '../utils/redis';

/**
 * Handles `/files` endpoint.
 */
class FilesController {
  /**
   * Creates a new file in DB and in local disk.
   * @param {Request} req Request to server
   * @param {Response} res Response from server
   */

  static async postUpload(req, res) {
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
    // get params from request body
    const {
      name, type, data, parentId,
    } = req.body;
    let { // will be set to defaults is not provided
      isPublic,
    } = req.body;

    // check if valid required fields are passed in request
    if (!name) {
      res.status(400).send({ error: 'Missing name' });
      return;
    }
    const TYPES = ['folder', 'file', 'image']; // allowed types
    if (!(type && TYPES.includes(type))) {
      res.status(400).send({ error: 'Missing type' });
      return;
    }
    if (!(data || type === 'folder')) { // data required for file & image types
      res.status(400).send({ error: 'Missing data' });
      return;
    }

    // if parentId is given, check if it exists and is of type folder
    if (parentId) {
      const parentFile = await dbClient.db.collection('files')
        .findOne({ _id: new ObjectId(parentId) });
      if (!parentFile) {
        res.status(400).send({ error: 'Parent not found' });
        return;
      }
      if (parentFile.type !== 'folder') {
        res.status(400).send({ error: 'Parent is not a folder' });
        return;
      }
    }

    // set defaul values for optional params not passed in request
    isPublic = isPublic || false;
    // if parentId create an ObjectId with it, to be used for saving in db
    const parentIdDb = parentId ? new ObjectId(parentId) : '0';
    const parentIdResponse = parentId || 0;

    // If the type is folder, add the new file to DB & return the new file
    if (type === 'folder') {
      const result = await dbClient.db.collection('files')
        .insertOne({ // use ObjectId type for userId
          userId: user._id, name, type, isPublic, parentId: parentIdDb,
        });

      res.status(201).send({ // use string type for userId
        id: result.insertedId, userId, name, type, isPublic, parentId: parentIdResponse,
      });
      return;
    }

    // generate random file name
    const fileName = uuidv4();
    // save data to file in local storage, and get the absolute path
    const localPath = await fsClient.writeFile(fileName, data);

    // save the new file in db in files collection & return the new file
    const result = await dbClient.db.collection('files')
      .insertOne({
        userId: user._id, name, type, isPublic, parentId: parentIdDb, localPath,
      });

    res.status(201).send({
      id: result.insertedId, userId, name, type, isPublic, parentId: parentIdResponse,
    });
  }
}

export default FilesController;
