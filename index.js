"use strict";
/// <reference path="./index.d.ts" />
/// <reference types="nulllogger" />
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose = require("mongoose");
mongoose.Promise = global.Promise;
const async = require("async");
const path = require("path");
const _ = require("lodash");
const fs = require("fs");
var Schema = mongoose.Schema, ObjectId = mongoose.Types.ObjectId;
var jsFile = /^(.+)\.js$/;
module.exports = function nexusfork_mongoose(app, config, logger, next) {
    var schemaBase = path.resolve(config.schemas);
    logger.debug("Loading Schemas", schemaBase);
    fs.readdir(schemaBase, function (err, files) {
        if (err)
            return next(err);
        var Schemas = {};
        async.each(files, function (file, callback) {
            var filename = file.match(jsFile);
            if (!filename)
                return callback();
            var Schema = require(path.resolve(schemaBase, file));
            if (!_.isPlainObject(Schema))
                throw new Error("Expected Plain Object for Schema: " + file);
            Schemas[filename[1]] = Schema;
            callback();
        }, function (err) {
            if (err)
                return next(err);
            logger.debug("Schemas Loaded", Schemas);
            var Models = {}, CollectionMap = {};
            logger.info("Connecting to database", config.uri);
            var conn = mongoose.createConnection('mongodb://' + config.uri, {
                reconnectTries: Number.MAX_VALUE,
                reconnectInterval: 1000,
                autoReconnect: true,
                user: config.user,
                pass: config.pass
            }, function (err) {
                if (err) {
                    next(err);
                    return;
                }
                if (app)
                    app.db = {
                        Models: Models,
                        Schemas: Schemas,
                        ObjectId: ObjectId,
                        Connection: conn
                    };
                next(null, function mongodb(req, res, next) {
                    req.db = {
                        Models: Models,
                        Schemas: Schemas,
                        ObjectId: ObjectId,
                        Connection: conn
                    };
                    next();
                });
            });
            for (var key in Schemas) {
                (function (key) {
                    var layout = Schemas[key];
                    var collection = layout.collection || key;
                    delete layout.collection;
                    CollectionMap[key] = collection;
                })(key);
            }
            for (var key in Schemas) {
                (function (key) {
                    var layout = Schemas[key];
                    var indexes = layout.indexes;
                    var methods = layout.methods;
                    var statics = layout.statics;
                    var configure = layout.configure;
                    var virtual = layout.virtual;
                    delete layout.configure;
                    delete layout.virtual;
                    delete layout.indexes;
                    delete layout.methods;
                    delete layout.statics;
                    for (var key0 in layout) {
                        try {
                            var field = layout[key0];
                            if (!field.ref)
                                throw "No ref";
                        }
                        catch (e) {
                            continue;
                        }
                        if (!(field.ref in CollectionMap))
                            throw new Error("Unknown Schema Referenced: " + field.ref);
                        field.ref = CollectionMap[field.ref];
                    }
                    var fields = [];
                    var schema = Schemas[key] = new Schema(layout /*, {autoIndex: false}*/);
                    if (methods)
                        _.extend(schema.methods, methods);
                    if (statics)
                        _.extend(schema.statics, statics);
                    if (virtual)
                        for (var name in virtual) {
                            schema.virtual(name).get(virtual[name]);
                        }
                    _.keys(layout).forEach(function (field) {
                        var obj = layout[field];
                        if (!obj.private)
                            fields.push(field);
                        if ("save" in obj)
                            schema.pre('save', function (next) {
                                this.set(field, obj.save());
                                next();
                            });
                    });
                    if (indexes)
                        schema.index(indexes, { unique: true });
                    if (configure)
                        configure(schema, layout);
                    var collection = CollectionMap[key];
                    (Models[key] = conn.model(collection, schema)).copy = function (source, target) {
                        target = target || {};
                        fields.forEach(function (field) {
                            target[field] = source[field];
                        });
                        target._id = source._id;
                        return target;
                    };
                    logger.gears("Model", key, "Initialized", collection);
                })(key);
            }
        });
    });
};
//# sourceMappingURL=index.js.map