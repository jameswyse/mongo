
/**
 * Module dependencies.
 */

var client = require('./model').client,
    batch = require('batch'),
    noop = function() {};

/**
 * Register an error `msg` on `attr`.
 *
 * @param {String} attr
 * @param {String} msg
 * @return {Object} self
 * @api public
 */

exports.error = function(attr, msg){
  this.errors.push({
    attr: attr,
    message: msg
  });
  return this;
};

/**
 * Check if this model is new.
 *
 * @return {Boolean}
 * @api public
 */

exports.isNew = function(){
  var key = this.model.primaryKey;
  return ! this.has(key);
};

/**
 * Get / set the primary key.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api public
 */

exports.primary = function(val){
  var key = this.model.primaryKey;
  if (0 == arguments.length) return this[key]();
  return this[key](val);
};

/**
 * Validate the model and return a boolean.
 *
 * Example:
 *
 *    user.isValid()
 *    // => false
 *
 *    user.errors
 *    // => [{ attr: ..., message: ... }]
 *
 * @return {Boolean}
 * @api public
 */

exports.isValid = function(){
  this.validate();
  return 0 == this.errors.length;
};

/**
 * Return `false` or an object
 * containing the "dirty" attributes.
 *
 * Optionally check for a specific `attr`.
 *
 * @param {String} [attr]
 * @return {Object|Boolean}
 * @api public
 */

exports.changed = function(attr){
  var dirty = this.dirty;
  if (Object.keys(dirty).length) {
    if (attr) return !! dirty[attr];
    return dirty;
  }
  return false;
};

/**
 * Perform validations.
 *
 * @api private
 */

exports.validate = function(){
  var self = this;
  var fns = this.model.validators;
  this.errors = [];
  fns.forEach(function(fn) { fn(self); });
};

/**
 * Destroy the model and mark it as `.removed`
 * and invoke `fn(err)`.
 *
 * Events:
 *
 *  - `removing` before deletion
 *  - `remove` on deletion
 *
 * @param {Function} [fn]
 * @api public
 */

exports.remove = function(fn){
  fn = fn || noop;
  if (this.isNew()) return fn(new Error('not saved'));
  var self = this,
      db = this.model.db,
      _id = this.primary();

  this.run('removing', function() {
    db.remove({ _id : _id }, function(err) {
      if (err) return fn(err);
      self.removed = true;
      self.model.emit('remove', self);
      self.emit('remove');
      fn();
    });
  });
};

/**
 * Save and invoke `fn(err)`.
 *
 * Events:
 *
 *  - `save` on updates and saves
 *  - `saving` pre-update or save, after validation
 *
 * @param {Function} [fn]
 * @api public
 */

exports.save = function(fn){
  if (!this.isNew()) return this.update(fn);
  var self = this,
      db = this.model.db;

  fn = fn || noop;
  if (!this.isValid()) return fn(new Error('validation failed'));

  this.run('saving', function() {
    db.insert(self.attrs, function(err, doc) {
      if(err) return fn(err);
      self.primary(doc._id);
      self.dirty = {};
      self.model.emit('save', self);
      self.emit('save');
      fn(null, self);
    });
  });
};

/**
 * Update and invoke `fn(err)`.
 *
 * @param {Function} [fn]
 * @api private
 */

exports.update = function(fn){
  var self = this,
      _id = this.primary(),
      changed = this.changed();
      db = this.model.db;

  fn = fn || noop;
  if(!changed) return fn(null, this);
  if (!this.isValid()) return fn(new Error('validation failed'));

  this.run('saving', function() {
    db.findAndModify({ _id : _id }, { $set : changed }, function(err) {
      if (err) return fn(err);
      self.dirty = {};
      self.model.emit('save', self);
      self.emit('save');
      fn(null, self);
    });
  });
};

/**
 * Set multiple `attrs`.
 *
 * @param {Object} attrs
 * @return {Object} self
 * @api public
 */

exports.set = function(attrs){
  for (var key in attrs) {
    this[key](attrs[key]);
  }
  return this;
};

/**
 * Get `attr` value.
 *
 * @param {String} attr
 * @return {Mixed}
 * @api public
 */

exports.get = function(attr){
  return this.attrs[attr];
};

/**
 * Check if `attr` is present (not `null` or `undefined`).
 *
 * @param {String} attr
 * @return {Boolean}
 * @api public
 */

exports.has = function(attr){
  return null != this.attrs[attr];
};

/**
 * Return the JSON representation of the model.
 *
 * @return {Object}
 * @api public
 */

exports.toJSON = function(){
  return this.attrs;
};

/**
 * Run functions beforehand
 *
 * @param {String} event
 * @param {Function} fn
 */

exports.run = function(event, done) {
  var fns = this.model.listeners(event).concat(this.listeners(event)),
      pending = 0;

  function next() {
    if(!--pending) return done();
  }

  for (var i = 0, len = fns.length; i < len; i++) {
    var fn = fns[i];
    if (fn.length > 1) {
      pending++;
      fn(this, next);
    } else {
      fn(this);
    }
  }

  if(!pending) return done();
};
