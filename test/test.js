function response(body, head) {
  return {
    head: head || {
      ok: true,
      status: 200,
      references: {}
    },
    body: body || {}
  };
}

function json(data) {
  return angular.toJson(data);
}

function headers(hdr) {
  return angular.extend({
    'Accept': 'application/json, text/plain, */*'
  }, hdr);
}

describe('API Client', function() {
  var api, http, serialize;

  function url(path, params) {
    return 'https://api.flowthings.io/v0.1/test' + path + (params ? '?' + serialize(params) : '');
  }

  beforeEach(module('flowthings', function(flowthingsProvider, $provide) {
    flowthingsProvider.options.account = 'test';
    flowthingsProvider.options.token = 'test';
  }));

  beforeEach(inject(function($injector) {
    api = $injector.get('flowthings');
    http = $injector.get('$httpBackend');
    serialize = $injector.get('$httpParamSerializer');
  }));

  afterEach(function() {
    http.verifyNoOutstandingExpectation();
    http.verifyNoOutstandingRequest();
  });

  it('flow.read', function() {
    api.flow.read('<test_id>');
    http
      .expect('GET', url('/flow/<test_id>'))
      .respond(response({}));

    http.flush();
  });

  it('flow.readMany', function() {
    api.flow.readMany(['a', 'b', 'c']);
    http
      .expect('MGET', url('/flow'), ['a', 'b', 'c'])
      .respond(response({}));

    http.flush();
  });

  it('flow.findMany', function() {
    api.flow.findMany({ filter: { foo: 'bar' }, limit: 10 });
    http
      .expect('GET', url('/flow', { filter: '(foo == "bar")', limit: 10 }))
      .respond(response([]));

    http.flush();
  });

  it('flow.find', function() {
    api.flow.find();
    http
      .expect('GET', url('/flow'))
      .respond(response([]));

    api.flow.find({ filter: { foo: 'bar' }, limit: 10 });
    http
      .expect('GET', url('/flow', { filter: '(foo == "bar")', limit: 10 }))
      .respond(response([]));

    api.flow.find('<test_id>');
    http
      .expect('GET', url('/flow/<test_id>'))
      .respond(response({}));

    api.flow.find(['a', 'b', 'c']);
    http
      .expect('MGET', url('/flow'), ['a', 'b', 'c'])
      .respond(response({}));
      
    http.flush();
  });

  it('drop.create', function() {
    api.drop.create({ path: '/foo' });
    http
      .expect('POST', url('/drop'), { path: '/foo' })
      .respond({});

    http.flush();
  });

  it('drop().read', function() {
    api.drop('<flow_id>').read('<test_id>');
    http
      .expect('GET', url('/drop/<flow_id>/<test_id>'))
      .respond(response({}));

    http.flush();
  });

  it('drop().readMany', function() {
    api.drop('<flow_id>').readMany(['a', 'b', 'c']);
    http
      .expect('MGET', url('/drop/<flow_id>'), ['a', 'b', 'c'])
      .respond(response({}));

    http.flush();
  });

  it('drop().findMany', function() {
    api.drop('<flow_id>').findMany({ filter: { foo: 'bar' }, limit: 10 });
    http
      .expect('GET', url('/drop/<flow_id>', { filter: '(foo == "bar")', limit: 10 }))
      .respond(response({}));

    http.flush();
  });

  it('drop().find', function() {
    api.drop('<flow_id>').find('<test_id>');
    http
      .expect('GET', url('/drop/<flow_id>/<test_id>'))
      .respond(response({}));

    api.drop('<flow_id>').find(['a', 'b', 'c']);
    http
      .expect('MGET', url('/drop/<flow_id>'), ['a', 'b', 'c'])
      .respond(response({}));

    api.drop('<flow_id>').find({ filter: { foo: 'bar' }, limit: 10 });
    http
      .expect('GET', url('/drop/<flow_id>', { filter: '(foo == "bar")', limit: 10 }))
      .respond(response({}));

    http.flush();
  });

  it('drop().create', function() {
    api.drop('<flow_id>').create({ elems: { foo: 'bar' }});
    http
      .expect('POST', url('/drop/<flow_id>'), { elems: { foo: 'bar' }})
      .respond({});

    http.flush();
  });

  it('drop().update', function() {
    api.drop('<flow_id>').update({ id: '<test_id>', elems: { foo: 'bar' }});
    http
      .expect('PUT', url('/drop/<flow_id>/<test_id>'), { id: '<test_id>', elems: { foo: 'bar' }})
      .respond({});

    http.flush();
  });

  it('drop().save', function() {
    api.drop('<flow_id>').save({ elems: { foo: 'bar' }});
    http
      .expect('POST', url('/drop/<flow_id>'), { elems: { foo: 'bar' }})
      .respond({});

    api.drop('<flow_id>').save({ id: '<test_id>', elems: { foo: 'bar' }});
    http
      .expect('PUT', url('/drop/<flow_id>/<test_id>'), { id: '<test_id>', elems: { foo: 'bar' }})
      .respond({});

    http.flush();
  });

  it('drop().aggregate', function() {
    api.drop('<flow_id>')
      .aggregate({
        filter: '',
        groupBy: [],
        output: ['$count', '$avg:test'],
        rules: {}
      });
    http
      .expect('POST', url('/drop/<flow_id>/aggregate'), {
        filter: '',
        groupBy: [],
        output: ['$count', '$avg:test'],
        rules: {}
      })
      .respond({});

    http.flush();
  });
});

describe('WS Client', function() {
  var api, http, client, root;

  beforeEach(module('flowthings', function(flowthingsProvider, $provide) {
    $provide.value('ftWebSocket', function(url) {
      return {
        url: url,
        send: angular.noop
      }
    });
    flowthingsProvider.options.account = 'test';
    flowthingsProvider.options.token = 'test';
  }));

  beforeEach(inject(function($injector) {
    api = $injector.get('flowthings');
    http = $injector.get('$httpBackend');
    root = $injector.get('$rootScope');

    http
      .expect('POST', 'https://ws.flowthings.io/session', null, headers({
        'X-Auth-Account': 'test',
        'X-Auth-Token': 'test'
      }))
      .respond(response({ id: '<test_session>' }));

    api.ws.connect().then(function(_client) {
      client = _client;
    });
  }));

  afterEach(function() {
    http.verifyNoOutstandingExpectation();
    http.verifyNoOutstandingRequest();
  });

  it('connect()', function() {
    expect(client)
      .toBeUndefined();

    http.flush();

    expect(client)
      .toBeDefined();

    expect(client.__socket.url)
      .toEqual('wss://ws.flowthings.io/session/<test_session>/ws')
  });

  it('subscription lifecycle', function() {
    http.flush();

    var drop;
    var subscribed = false;
    var sub = client.subscribe('<test_id>', function(_drop) {
      drop = _drop;
    });

    sub.result.then(function() {
      subscribed = true;
    });

    expect(drop)
      .toBeUndefined();

    expect(subscribed)
      .toEqual(false);

    client.__receive(json(response({}, { ok: true, msgId: 1 })));

    expect(subscribed)
      .toEqual(true);

    client.__receive(json({
      type: 'message',
      value: { flowId: '<test_id>' }
    }));

    expect(drop)
      .toEqual({ flowId: '<test_id>' });

    drop = undefined;
    sub.unsubscribe();

    client.__receive(json({
      type: 'message',
      value: { flowId: '<test_id>' }
    }));

    expect(drop)
      .toBeUndefined();
  });

  it('concurrent subscriptions', function() {
    http.flush();

    var drop1;
    var drop2;
    var sub1 = client.subscribe('<test_id>', function(_drop) {
      drop1 = _drop;
    });
    var sub2 = client.subscribe('<test_id>', function(_drop) {
      drop2 = _drop;
    });

    expect(drop1)
      .toBeUndefined();

    expect(drop2)
      .toBeUndefined();

    client.__receive(json(response(true, { ok: true, msgId: 1 })));
    client.__receive(json({
      type: 'message',
      value: { flowId: '<test_id>' }
    }));

    expect(drop1)
      .toEqual({ flowId: '<test_id>' });

    expect(drop2)
      .toEqual({ flowId: '<test_id>' });
  });

  it('subscription scope', function() {
    http.flush();

    var drop;
    var scope = root.$new();
    var sub = client.subscribe('<test_id>', function(_drop) {
      drop = _drop;
    }, scope);

    client.__receive(json(response(true, { ok: true, msgId: 1 })));
    client.__receive(json({
      type: 'message',
      value: { flowId: '<test_id>' }
    }));

    expect(drop)
      .toBeDefined();

    drop = undefined;
    scope.$destroy();

    client.__receive(json({
      type: 'message',
      value: { flowId: '<test_id>' }
    }));

    expect(drop)
      .toBeUndefined();
  });

  it('send()', function() {
    http.flush();

    var resp;
    client.send({}).then(function(_resp) { resp = _resp });
    client.__receive(json(response(true, { ok: true, msgId: 1 })));

    expect(resp)
      .toEqual(true);
  });

  it('send() error', function() {
    http.flush();

    var resp;
    client.send({}).catch(function(_resp) { resp = _resp });
    client.__receive(json(response(true, { ok: false, msgId: 1 })));

    expect(resp.body)
      .toEqual(true);
  });

  it('send() disconnect', function() {
    http.flush();

    var resp;
    client.send({}).then(function() { resp = 1 }, function() { resp = 2 });
    client.__socket.onclose({});

    expect(resp)
      .toEqual(2);
  });

  it('event open', function() {
    http.flush();

    var resp;
    root.$on('flowthings:open', function(e, _client) { resp = _client });
    client.__socket.onopen();

    expect(resp)
      .toBe(client);
  });

  it('event close', function() {
    http.flush();

    var resp;
    root.$on('flowthings:close', function(e, e2) { resp = e2 });
    client.__socket.onclose('test');

    expect(resp)
      .toEqual('test');
  });

  it('event error', function() {
    http.flush();

    var resp;
    root.$on('flowthings:error', function(e) { resp = true });
    client.__socket.onerror();

    expect(resp)
      .toEqual(true);
  });
});
