// Files controller for express router
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import dbClient from '../utils/db';
import fsClient from '../utils/fs';
import redisClient from '../utils/redis';

const Bull = require('bull');
// create a queue named fileQueue to handle
// creating thumbnails for image files (using worker.js)
const fileQueue = new Bull('fileQueue');

/**
 * Handles `/files` endpoint.
 */
class FilesController {
  /**
   * POST /files
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

    // get params from request body
    const {
      name, type, data, parentId,
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
      if (parentId.length !== 24) { // ObjectId Argument must be a string of 24 hex chars
        res.status(400).send({ error: 'Parent not found' });
        return;
      }

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

    // if isPublic is not passed set it to default value of false
    const isPublic = req.body.isPublic || false;
    // if parentId create an ObjectId with it, to be used for saving in db
    const parentIdDb = parentId ? new ObjectId(parentId) : '0';
    // if parentId use string, else set to 0. to be used for response body
    const parentIdResponse = parentId || 0;

    // If the type is folder, add the new file to DB & return the new file
    if (type === 'folder') {
      const result = await dbClient.db.collection('files')
        .insertOne({ // use ObjectId type for userId
          userId: new ObjectId(userId), name, type, isPublic, parentId: parentIdDb,
        });

      res.status(201).send({ // use string type for userId (check if isPublic should be returned)
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
        userId: new ObjectId(userId), name, type, isPublic, parentId: parentIdDb, localPath,
      });

    // add job to a Bull queue if file type is image to create thumbnails
    if (type === 'image') {
      fileQueue.add({ fileId: result.insertedId, userId });
    }

    res.status(201).send({
      id: result.insertedId, userId, name, type, isPublic, parentId: parentIdResponse,
    });
  }

  /**
   * GET /files/:id
   * Retrieves requesting user's file documents based on the ID.
   * @param {Request} req Request to server
   * @param {Response} res Response from server
   */
  static async getShow(req, res) {
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

    // retrieve document of given id linked to current user
    const documentId = req.params.id;
    if (documentId.length !== 24) { // ObjectId Argument must be a string of 24 hex chars
      res.status(404).send({ error: 'Not found' });
      return;
    }
    const document = await dbClient.db.collection('files')
      .findOne({ _id: new ObjectId(documentId), userId: new ObjectId(userId) });
    if (!document) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    // send document
    res.send({
      id: document._id.toString(),
      userId: document.userId.toString(),
      name: document.name,
      type: document.type,
      isPublic: document.isPublic,
      parentId: document.parentId === '0' ? 0 : document.parentId.toString(),
    });
  }

  /**
   * GET /files
   * Retrieves all users file documents for a specific parentId and with pagination.
   * @param {Request} req Request to server
   * @param {Response} res Response from server
   */
  static async getIndex(req, res) {
    // get token from X-Token header in request
    const token = req.header('X-Token');
    if (!token) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }

    // retrive user id from redis
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      res.status(401).send({ error: 'Unauthorized' });
      return;
    }

    // get parentId & page query params
    const { parentId = '0', page = 0 } = req.query;

    if (parentId !== '0' && parentId.length !== 24) {
      // ObjectId Argument must be a string of 24 hex chars
      res.send([]); // send empty list
      return;
    }

    // if parentId is given find users document in it. Else return from root (parentId = 0)
    let filter;
    if (parentId === '0') filter = { userId: new ObjectId(userId), parentId };
    else filter = { parentId: new ObjectId(parentId), userId: new ObjectId(userId) };

    // create a pipe line for aggreagate with pagination.
    // each page contains 20 documents & page no. starts from 0.
    const pipeline = [
      { $match: filter },
      { $skip: parseInt(page, 10) * 20 },
      { $limit: 20 },
    ];

    // after getting list of docs from db send list of documents
    const result = await dbClient.db.collection('files').aggregate(pipeline).toArray();
    const responseDocuments = result.map(({ _id, ...attrs }) => ({ id: _id, ...attrs }));
    res.status(200).send(responseDocuments);
  }

  /**
   * PUT /files/:id/publish
   * Set isPublic to true on the file document based on the ID.
   * @param {Request} req Request to server
   * @param {Response} res Response from server
   */
  static async putPublish(req, res) {
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

    // retrieve document of given id linked to current user
    const documentId = req.params.id;
    if (documentId.length !== 24) { // ObjectId Argument must be a string of 24 hex chars
      res.status(404).send({ error: 'Not found' });
      return;
    }

    // publish doc by setting isPublic to true
    try {
      const response = await dbClient.db.collection('files')
        .findOneAndUpdate(
          { _id: new ObjectId(documentId), userId: new ObjectId(userId) },
          { $set: { isPublic: true } },
        );
      res.send({
        id: response.value._id,
        userId: response.value.userId,
        name: response.value.name,
        type: response.value.type,
        isPublic: true,
        parentId: response.value.parentId,
      });
    } catch (e) {
      res.status(404).send({ error: 'Not found' });
    }
  }

  /**
   * PUT /files/:id/unpublish
   * Set isPublic to false on the file document based on the ID.
   * @param {Request} req Request to server
   * @param {Response} res Response from server
   */
  static async putUnpublish(req, res) {
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

    // retrieve document of given id linked to current user
    const documentId = req.params.id;
    if (documentId.length !== 24) { // // ObjectId Argument must be a string of 24 hex chars
      res.status(404).send({ error: 'Not found' });
      return;
    }

    // unpublish doc by setting isPublic to false
    try {
      const response = await dbClient.db.collection('files')
        .findOneAndUpdate(
          { _id: new ObjectId(documentId), userId: new ObjectId(userId) },
          { $set: { isPublic: false } },
        );
      res.send({
        id: response.value._id,
        userId: response.value.userId,
        name: response.value.name,
        type: response.value.type,
        isPublic: false,
        parentId: response.value.parentId,
      });
    } catch (e) {
      res.status(404).send({ error: 'Not found' });
    }
  }

  /**
   * PUT /files/:id/data
   * Returns the content of the file document based on the ID.
   * @param {Request} req Request to server
   * @param {Response} res Response from server
   */
  static async getFile(req, res) {
    // get token from X-Token header in request
    const token = req.get('X-Token');
    const key = `auth_${token}`;
    // retrive user id from redis
    const userId = await redisClient.get(key);

    // retrieve document of given id
    const documentId = req.params.id;
    if (documentId.length !== 24) { // ObjectId Argument must be a string of 24 hex chars
      res.status(404).send({ error: 'Not found' });
    }
    const document = await dbClient.db.collection('files')
      .findOne({ _id: new ObjectId(documentId) });
    if (!document) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    // if document is not public and user is not the owner return Not found
    if (!document.isPublic && (!userId || document.userId.toString() !== userId)) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    // if document type is a folder return error
    if (document.type === 'folder') {
      res.status(400).send({ error: "A folder doesn't have content" });
      return;
    }

    // local path of file
    let { localPath } = document;

    const { size } = req.query; // Image width. for images only.
    // if file type is image, check if valid size parameter is given: [500, 250, 100]
    if (size && document.type === 'image') {
      if (['500', '250', '100'].includes(size)) { // add _<size> suffix to localPath
        localPath += `_${size}`;
      } else { // retrun error
        res.status(404).send({ error: 'Not found' });
        return;
      }
    }
    // read data from file
    const data = await fsClient.readFile(localPath);
    // if document is not found at localPath return error
    if (data === null) {
      res.status(404).send({ error: 'Not found' });
      return;
    }

    // Get mime-type from file name
    const contentType = mime.lookup(document.name);
    // set header and set data
    res.set('Content-type', contentType);
    res.send(data);
  }
}

export default FilesController;
