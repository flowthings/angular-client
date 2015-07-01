void function(angular, global) {
  var flowthings = angular.module('flowthings', []);

  flowthings.provider('ftRequest', function() {
    var provider = this;

    provider.options = {
      host: 'api.flowthings.io',
      version: '0.1',
      secure: true
    };

    provider.$get = ['$http', '$q', function($http, $q) {
      return function(creds, method, path, data, opts) {
        var timeout = params && params.timeout;
        var cache = params && params.cache;
        var url = mkApiUrl(creds, path, provider.options);
        var params = mkParams(opts);
        var headers = mkHeaders(creds);
        var request = $http({
          url: url,
          method: method,
          data: data,
          params: params,
          timeout: timeout,
          cache: cache,
          headers: headers
        });

        return request.then(function(resp) {
          if (params.refs) {
            return [resp.data.body, resp.data.head.references];
          } else {
            return resp.data.body;
          }
        });
      };
    }];
  });

  flowthings.value('ftWebSocketBackend', global.WebSocket);

  flowthings.provider('ftWebSocket', function() {
    var provider = this;

    provider.options = {
      host: 'ws.flowthings.io',
      secure: true,
    };

    provider.$get = ['$http', '$q', 'ftWebSocketBackend', function($http, $q, WebSocket) {
      return function(creds) {
        var handshake = $http({
          url: mkWsUrl('http', provider.options),
          headers: mkHeaders(creds),
          method: 'POST',
        });

        return handshake.then(function(resp) {
          return new WebSocket(mkWsUrl('ws', provider.options) + '/' + resp.data.body.id + '/ws');
        });
      };
    }];
  });

  flowthings.provider('flowthings', function() {
    var provider = this;

    provider.options = {
      account: null,
      token: null
    };

    provider.$get = ['ftRequest', 'ftWebSocket', '$timeout', '$q', '$rootScope', function($request, $connect, $timeout, $q, $rootScope) {
      function $broadcast(name, data) {
        return $rootScope.$broadcast('flowthings:' + name, data);
      }
      function $apply(fn) {
        return $rootScope.$apply(fn);
      }
      return angular.extend(
        APIClient(provider.options, $request),
        WebSocketClient(provider.options, $connect, $broadcast, $timeout, $q, $apply));
    }];
  });

  function APIClient(creds, $request) {
    var request = $request.bind(null, creds);
    return {
      request: request,
      flow: Service(request, '/flow', [FindableMixin]),
      drop: angular.extend(
        ServiceFactory(request, '/drop', [FindableMixin, UpdateableMixin]),
        Service(request, '/drop', [CreateableMixin]))
    };
  }

  function WebSocketClient(creds, $connect, $broadcast, $timeout, $q, $apply) {
    var conn = null;
    var subs = {};
    var reps = {};
    var queue = [];
    var connected = false;
    var msgId = 1;
    var timer;

    var client = {
      connect: connect,
      subscribe: subscribe,
      send: send,
      $$receive: receive,
      $$flush: flush
    };

    function connect() {
      if (connected) {
        $q.when(client);
      }
      return $connect(creds).then(function(_conn) {
        conn = _conn;
        conn.onopen = function() {
          connected = true;
          timer = $timeout(heartbeat, 30000, false);
          flush();
          $apply(function() {
            $broadcast('open', client);
          });
        };
        conn.onmessage = function(e) {
          receive(e.data);
        };
        conn.onerror = function() {
          cleanup();
          $apply(function() {
            $broadcast('error');
          });
        };
        conn.onclose = function(e) {
          cleanup();
          $apply(function() {
            $broadcast('close', e.code, e.reason);
          });
        };
        client.$$socket = conn;
        return client;
      });
    } 
    function subscribe(path, callback, scope) {
      var result;
      var unwatch = scope
        ? scope.$on('$destroy', unsubscribe)
        : angular.noop

      function unsubscribe() {
        if (subs[path]) {
          subs[path].subs = subs[path].subs.filter(function(c) {
            return c !== callback;
          });
          if (subs[path].subs.length === 0) {
            delete subs[path];
            send(mkAction('drop', 'unsubscribe', path));
          }
        }
        unwatch();
      }

      if (subs.hasOwnProperty(path)) {
        result = subs[path];
      } else {
        result = subs[path] = send(mkAction('drop', 'subscribe', path));
        result.subs = [];
      }

      return {
        unsubscribe: unsubscribe,
        result: result.then(function() {
          if (subs[path]) {
            subs[path].subs = subs[path].subs.concat(callback);
          }
        })
      };
    }
    function flush() {
      while (queue.length) {
        queue.shift()();
      }
    }
    function send(msg, reply) {
      var dfd;

      if (reply !== false) {
        var id  = msgId++;
        dfd = reps[id] = $q.defer();
        msg = angular.extend({}, msg, { msgId: id });
      }

      function run() {
        conn.send(angular.toJson(angular.extend({}, msg, { msgId: id })));
      }

      if (connected) {
        run();
      } else {
        queue.push(run);
      }

      return dfd && dfd.promise;
    }
    function receive(str) {
      var msg = JSON.parse(str);
      if (msg.type === 'message') {
        $apply(function() {
          function dispatch(cb) {
            cb(msg.value);
          }
          if (subs.hasOwnProperty(msg.value.flowId)) {
            angular.forEach(subs[msg.value.flowId].subs, dispatch);
          }
          if (subs.hasOwnProperty(msg.value.path)) {
            angular.forEach(subs[msg.value.path].subs, dispatch);
          }
        });
      } else {
        var id = msg.head.msgId;
        if (reps.hasOwnProperty(id)) {
          $apply(function() {
            if (msg.head.ok) {
              reps[id].resolve(msg.body);
            } else {
              reps[id].reject(msg);
            }
            delete reps[id];
          });
        }
      }
    }
    function cleanup() {
      $timeout.cancel(timer);
      connected = false;
      conn  = null;
      subs  = {};
      reps  = {};
      queue = [];
      msgId = 1;
    }
    function heartbeat() {
      if (conn) {
        send({ type: 'heartbeat' }, false);
        timer = $timeout(heartbeat, 30000, false);
      }
    }
    return client;
  }

  function FindableMixin($request) {
    function read(id, params) {
      return $request('GET', '/' + id, null, params);
    }
    function readMany(ids, params) {
      return $request('MGET', '', ids, params);
    }
    function findMany(params) {
      return $request('GET', '', null, params);
    }
    function find(_0, _1) {
      if (angular.isString(_0)) {
        return read(_0, _1);
      }
      if (angular.isArray(_0)) {
        return readMany(_0, _1);
      }
      return findMany(_0);
    }
    return {
      read: read,
      readMany: readMany,
      findMany: findMany,
      find: find
    };
  }

  function CreateableMixin($request) {
    function create(model, params) {
      return $request('POST', '', model, params);
    }
    return {
      create: create
    };
  }

  function UpdateableMixin($request) {
    var createable = CreateableMixin($request);

    function update(model, params) {
      return $request('PUT', '/' + model.id, model, params);
    }
    function save(model, params) {
      if (model.id) {
        return update(model, params);
      }
      return createable.create(model, params);
    }
    return angular.extend(createable, {
      update: update,
      save: save
    });
  }

  function Service($request, path, mixins) {
    var service = {};
    angular.forEach(mixins, function(mixin) {
      angular.extend(service, mixin(anchorRequest($request, path)));
    });
    return service;
  }

  function ServiceFactory($request, path, mixins) {
    return function(context) {
      return Service($request, path + '/' + context, mixins);
    };
  }

  function anchorRequest($request, path) {
    return function(_0, _1, _2, _3) {
      return $request(_0, path + _1, _2, _3);
    }
  }

  function mkApiUrl(creds, path, opts) {
    return (opts.secure ? 'https' : 'http') + '://' + opts.host + '/v' + opts.version + '/' + creds.account + path;
  }

  function mkWsUrl(scheme, opts) {
    return scheme + (opts.secure ? 's' : '') + '://' + opts.host + '/session';
  }

  function mkHeaders(creds) {
    return {
      'X-Auth-Account': creds.account,
      'X-Auth-Token': creds.token
    }
  }

  function mkAction(object, type, path) {
    var data = {
      object: object,
      type: type
    };
    if (path.charAt(0) === '/') {
      data.path = path;
    } else {
      data.flowId = path;
    }
    return data;
  }

  var PARAMS_IGNORE = {
    'timeout': true,
    'cache': true
  };

  function mkParams(opts) {
    var params = {};

    angular.forEach(opts, function(val, key) {
      if (PARAMS_IGNORE.hasOwnProperty(key)) {
        return;
      }
      switch (key) {
        case 'only':
          if (angular.isArray(val)) {
            val = val.join(',');
          }
          break;
        case 'refs':
          val = val ? 1 : 0;
          break;
        case 'filter':
          if (!angular.isString(val)) {
            val = mkFilter(val)
          }
          break;
      }
      params[key] = val;
    });

    return params;
  }

  function mkFilter(spec) {
    var ast = [];

    angular.forEach(spec, function(val, key) {
      if (key === '$and') {
        ast.push([val.map(mkFilter).join('&&')]);
      }
      else if (key === '$or') {
        ast.push([val.map(mkFilter).join('||')]);
      }
      else if (isRegExp(val)) {
        ast.push([key, '=~', mkRegExp(val)]);
      }
      else if (val.hasOwnProperty('$regex')) {
        ast.push([key, '=~', mkEscapedRegExp(val.$regex)]);
      }
      else if (val.hasOwnProperty('$lt')) {
        ast.push([key, '<', angular.toJson(val.$lt)]);
      }
      else if (val.hasOwnProperty('$lte')) {
        ast.push([key, '<=', angular.toJson(val.$lte)]);
      }
      else if (val.hasOwnProperty('$gt')) {
        ast.push([key, '>', angular.toJson(val.$gt)]);
      }
      else if (val.hasOwnProperty('$gte')) {
        ast.push([key, '>=', angular.toJson(val.$gte)]);
      }
      else {
        ast.push([key, '==', angular.toJson(val)]);
      }
    });

    return ast.map(function(a) {
      return '(' + a.join(' ') + ')'
    }).join('&&')
  }

  function mkRegExp(regex) {
    var str = regex.source;
    var flags = '';

    if (regex.global) {
      flags += 'g';
    }

    if (regex.ignoreCase) {
      flags += 'i';
    }

    if (regex.multiline) {
      flags += 'm';
    }

    return '/' + str + '/' + flags;
  }

  function mkEscapedRegExp(regex) {
    var str, flags;

    if (angular.isArray(regex)) {
      str = reg[0];
      flags = reg[1] || '';
    } else {
      str = regex;
      flags = '';
    }

    return '/' + str.replace(/\//g, '\\/') + '/' + flags;
  }

  function isRegExp(regex) {
    return typeof regex === 'object' && Object.prototype.toString.call(regex) === '[object RegExp]';
  }
}(angular, window);
