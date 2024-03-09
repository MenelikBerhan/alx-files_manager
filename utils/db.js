// MongoDB Utils
import { MongoClient } from 'mongodb';

/**
 * MongoDB client class
 */
class DBClient {
  constructor() {
    // get params from env. If not present set default values
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const dbName = process.env.DB_DATABASE || 'files_manager';
    const url = `mongodb://${host}:${port}`;

    // create mongodb client instance
    this.client = new MongoClient(url);

    // connect to mongodb. If successful create db.
    this.client.connect()
      .then(() => {
        console.log('Successfuly connectd to mongodb.');
        this.db = this.client.db(dbName);
        console.log(`Database ${dbName} successfuly created.`);
      })
      .catch((reason) => console.log(reason));
  }

  /**
   * Checks if connection to MongoDB is successful.
   * @returns {boolean} true is successful, otherwise false.
   */
  isAlive() {
    return this.client.isConnected();
  }

  /**
   * Returns the number of documents in the collection `users`
   * @returns {Promise<Number>}
   */
  async nbUsers() {
    return this.db.collection('users').countDocuments();
  }

  /**
   * Returns the number of documents in the collection `files`
   * @returns {Promise<Number>}
   */
  async nbFiles() {
    return this.db.collection('files').countDocuments();
  }
}

const dbClient = new DBClient();
export default dbClient;
