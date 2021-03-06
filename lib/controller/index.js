'use strict';

var _ = require('underscore');
var BaseController = require('./base');

module.exports = BaseController.extend({

  init: function() {
    this.on('end-turn').then(this.isCurrentPlayer, this.endTurn);
    this.on('trade-offer').then(this.isCurrentPlayer, this.offerTrade);
    this.onRoad();
    this.onSettlement();
    this.onCity();
  },

  onRoad: function() {
    this.on('build-road', function(req) {
      return req.game.phase === 'setup';
    })
    .then(this.isCurrentPlayer,
          this.initRoad,
          this.endTurn
    );

    this.on('build-road', function(req) {
      return req.game.phase === 'playing';
    })
    .then(this.isCurrentPlayer,
          this.hasResources({ lumber: 1, brick: 1 }),
          this.hasAllowance('road'),
          this.buildRoad
    );
  },

  onSettlement: function() {
    this.on('build-settlement', function(req) {
      return req.game.phase === 'setup';
    })
    .then(this.isCurrentPlayer,
          this.initSettlement
    );

    this.on('build-settlement', function(req) {
      return req.game.phase === 'playing';
    })
    .then(this.isCurrentPlayer,
          this.hasResources({ lumber: 1, brick: 1, wool: 1, grain: 1 }),
          this.hasAllowance('settlement'),
          this.buildSettlement
    );
  },

  onCity: function() {
    this.on('build-city', function(req) {
      return req.game.phase === 'playing';
    })
    .then(this.isCurrentPlayer,
          this.hasResources({ ore: 3, grain: 2 }),
          this.hasAllowance('city'),
          this.buildCity
    );
  },

  start: function() {
    if (this.game.turn < 1) {
      this.emitter.emit('start-turn', this.game.getDataForTurn(1));
    }
  },

  isCurrentPlayer: function(req, next) {
    var yes = req.playerId === this.game.currentPlayer.id;

    if (!yes) {
      return next('Not current player');
    }

    next();
  },

  initSettlement: function(req, next) {
    var board = this.game.board;
    var ownedCorners = board.corners.query({
      owner: req.playerId
    });

    if (ownedCorners.length >= 2) {
      return next('Not valid move');
    }

    var corner = board.corners.getById(req.data.buildId);

    if (!corner.isBuildable) {
      return next('Not valid building spot');
    }

    req.addEvent('build-settlement', {
      playerId: req.playerId,
      buildId: req.data.buildId
    });
    next();
  },

  initRoad: function(req, next) {
    var board = this.game.board;
    var ownedEdges = board.edges.query({ owner: req.player });
    var distributeResources = ownedEdges.length === 1;
    var data = {};
    var resources = {
      brick: 0,
      grain: 0,
      lumber: 0,
      ore: 0,
      wool: 0
    };

    if (ownedEdges.length >= 2) {
      return next('Not a valid move');
    }

    var edge = board.edges.getById(req.data.buildId);

    if (!edge.isBuildable) {
      return next('Not a valid building spot');
    }

    var adjCorners = edge.getAdjacentCorners();
    var corner = _.find(adjCorners, function(_corner) {
      if (_corner.owner === null || _corner.owner !== req.playerId) {
        return false;
      } else {
        return _corner.getAdjacentEdges().every(function(_edge) {
          return _edge.isBuildable;
        });
      }
    });

    if (!corner) {
      return next('Road can only be built next to the last settlement');
    }

    req.addEvent('build-road', {
      playerId: req.playerId,
      buildId: req.data.buildId
    });

    if (distributeResources) {
      corner
        .getAdjacentTiles()
        .filter(function(tile) {
          return tile.isResource;
        })
        .forEach(function(tile) {
          resources[tile.type]++;
        });

      data[req.playerId] = resources;
      req.addEvent('distribute-resources', data);
    }

    next();
  },

  hasResources: function(resources) {
    return function(req, next) {
      var yes = req.player.hasResources(resources);

      if (!yes) {
        return next('User does not have required resources');
      }

      next();
    };
  },

  hasAllowance: function(object) {
    return function(req, next) {
      var objects = [];
      var yes = false;

      if (object === 'road') {
        objects = this.game.board.edges.query({
          owner: req.player
        });

        yes = objects.length < this.game.allowance.roads;
      }

      if (object === 'settlement') {
        objects = this.game.board.corners.query({
          owner: req.player,
          settlement: true
        });

        yes = objects.length < this.game.allowance.settlements;
      }

      if (object === 'city') {
        objects = this.game.board.corners.query({
          owner: req.player,
          city: true
        });

        yes = objects.length < this.game.allowance.cities;
      }

      if (!yes) {
        return next('User does not have allowance for this request');
      }

      next();
    }.bind(this);
  },

  buildRoad: function(req, next) {
    var buildableSpots = this.game.getBuildableEdgesForPlayer(req.player);

    var validSpot = buildableSpots.some(function(edge) {
      return edge.id === req.data.buildId;
    });

    if (!validSpot) {
      return next('Not a valid spot to build');
    }

    req.addEvent('build-road', {
      playerId: req.playerId,
      buildId: req.data.buildId
    });
    next();
  },

  buildSettlement: function(req, next) {
    var buildableSpots = this.game.getBuildableCornersForPlayer(req.player);

    var validSpot = buildableSpots.some(function(corner) {
      return corner.id === req.data.buildId;
    });

    if (!validSpot) {
      return next('Not a valid spot to build');
    }

    req.addEvent('build-settlement', {
      playerId: req.playerId,
      buildId: req.data.buildId
    });
    next();
  },

  buildCity: function(req, next) {
    var buildableSpots = this.game.board.corners.query({
      owner: req.player,
      settlement: true
    });

    var validSpot = buildableSpots.some(function(corner) {
      return corner.id === req.data.buildId;
    });

    if (!validSpot) {
      return next('Not a valid spot to build');
    }

    req.addEvent('build-city', {
      playerId: req.playerId,
      buildId: req.data.buildId
    });
    next();
  },

  endTurn: function(req, next) {
    var thisTurn = this.game.getDataForTurn(this.game.turn);
    var nextTurn = this.game.getDataForTurn(this.game.turn + 1);

    req.addEvent('end-turn', thisTurn);
    req.addEvent('start-turn', nextTurn);

    if (nextTurn.phase !== 'playing') {
      return next();
    }

    this.rollDice(req, next);
  },

  rollDice: function(req, next) {
    var die1 = this.d6();
    var die2 = this.d6();
    var total = die1 + die2;
    var data = {
      die1: die1,
      die2: die2,
      total: total
    };

    req.addEvent('DiceRoll', data);

    if (total === 7) {
      return next();
    }

    this.distributeResources(req, total, next);
  },

  distributeResources: function(req, diceTotal, next) {
    var data = {};
    var tiles = this.game.board.tiles.query({ value: diceTotal });

    this.game.players.forEach(function(player) {
      data[player.id] = {
        brick: 0,
        grain: 0,
        lumber: 0,
        ore: 0,
        wool: 0
      };
    });

    tiles.forEach(function(tile) {
      var _tiles = tile.getAdjacentCorners();
      _tiles.filter(function(corner) {
        return corner.owner != null;
      })
      .forEach(function(corner) {
        data[corner.owner][tile.type]++;

        if (corner.isCity) {
          data[corner.owner][tile.type]++;
        }
      });
    });

    req.addEvent('distribute-resources', data);
    next();
  },

  offerTrade: function(req, next) {
    var data = req.data;
    data.playerId = req.playerId;
    req.addEvent('trade-offer', data);
    next();
  }

});
