"use strict";
var $ = require("jquery");
//this is a mapping from the class names (generic ones, for compatability with codemirror themes), to what they -actually- represent
var tokenTypes = {
  "string-2": "prefixed",
  atom: "var"
};

module.exports = function(yate, completerName) {
  //this autocompleter also fires on-change!
  yate.on("change", function() {
    module.exports.appendPrefixIfNeeded(yate, completerName);
  });

  return {
    isValidCompletionPosition: function() {
      return module.exports.isValidCompletionPosition(yate);
    },
    get: function(token, callback) {
      $.getJSON(module.exports.fetchFrom, function(data) {
        var prefixArray = [];
        for (var prefix in data) {
          if (prefix == "bif") continue; // skip this one! see #231
          var completeString = prefix + ": <" + data[prefix] + ">";
          prefixArray.push(completeString); // the array we want to store in localstorage
        }

        prefixArray.sort();
        callback(prefixArray);
      });
    },
    preProcessToken: function(token) {
      return module.exports.preprocessPrefixTokenForCompletion(yate, token);
    },
    async: true,
    bulk: true,
    autoShow: true,
    persistent: completerName,
    callbacks: {
      pick: function() {
        yate.collapsePrefixes(false);
      }
    }
  };
};
module.exports.isValidCompletionPosition = function(yate) {
  var cur = yate.getCursor(), token = yate.getTokenAt(cur);

  // not at end of line
  if (yate.getLine(cur.line).length > cur.ch) return false;

  if (token.type != "ws") {
    // we want to complete token, e.g. when the prefix starts with an a
    // (treated as a token in itself..)
    // but we to avoid including the PREFIX tag. So when we have just
    // typed a space after the prefix tag, don't get the complete token
    token = yate.getCompleteToken();
  }

  // we shouldnt be at the uri part the prefix declaration
  // also check whether current token isnt 'a' (that makes codemirror
  // thing a namespace is a possiblecurrent
  if (!token.string.indexOf("a") == 0 && $.inArray("PNAME_NS", token.state.possibleCurrent) == -1) return false;

  // First token of line needs to be PREFIX,
  // there should be no trailing text (otherwise, text is wrongly inserted
  // in between)
  var previousToken = yate.getPreviousNonWsToken(cur.line, token);
  if (!previousToken || previousToken.string.toUpperCase() != "PREFIX" || previousToken.string.toUpperCase() != "@PREFIX") return false;
  return true;
};
module.exports.preprocessPrefixTokenForCompletion = function(yate, token) {
  var previousToken = yate.getPreviousNonWsToken(yate.getCursor().line, token);
  if (previousToken && previousToken.string && previousToken.string.slice(-1) == ":") {
    //combine both tokens! In this case we have the cursor at the end of line "PREFIX bla: <".
    //we want the token to be "bla: <", en not "<"
    token = {
      start: previousToken.start,
      end: token.end,
      string: previousToken.string + " " + token.string,
      state: token.state
    };
  }
  return token;
};
/**
 * Check whether typed prefix is declared. If not, automatically add declaration
 * using list from prefix.cc
 *
 * @param yate
 */
module.exports.appendPrefixIfNeeded = function(yate, completerName) {
  if (!yate.autocompleters.getTrie(completerName)) return; // no prefixed defined. just stop
  if (!yate.options.autocompleters || yate.options.autocompleters.indexOf(completerName) == -1) return; //this autocompleter is disabled
  var cur = yate.getCursor();

  var token = yate.getTokenAt(cur);
  if (tokenTypes[token.type] == "prefixed") {
    var colonIndex = token.string.indexOf(":");
    if (colonIndex !== -1) {
      // check previous token isnt PREFIX, or a '<'(which would mean we are in a uri)
      //			var firstTokenString = yate.getNextNonWsToken(cur.line).string.toUpperCase();
      var lastNonWsTokenString = yate.getPreviousNonWsToken(cur.line, token).string.toUpperCase();
      var previousToken = yate.getTokenAt({
        line: cur.line,
        ch: token.start
      }); // needs to be null (beginning of line), or whitespace
      if (lastNonWsTokenString != "PREFIX" && lastNonWsTokenString != "@PREFIX" && (previousToken.type == "ws" || previousToken.type == null)) {
        // check whether it isnt defined already (saves us from looping
        // through the array)
        var currentPrefix = token.string.substring(0, colonIndex + 1);
        var docPrefixes = yate.getPrefixesFromDocument();
        if (docPrefixes[currentPrefix.slice(0, -1)] == null) {
          // ok, so it isnt added yet!
          var completions = yate.autocompleters.getTrie(completerName).autoComplete(currentPrefix);
          if (completions.length > 0) {
            yate.addPrefixes(completions[0]);
          }
        }
      }
    }
  }
};

module.exports.fetchFrom = (window.location.protocol.indexOf("http") === 0 ? "//" : "http://") +
  "prefix.cc/popular/all.file.json";
