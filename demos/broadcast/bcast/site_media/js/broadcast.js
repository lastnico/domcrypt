var DEBUG = true;
var jsonMessages = [];
var timelineData = [];
var followers = [];
var timelineIndex = {};
var timeline;

const LOGIN_URL = "/bcast/login/";
const CREATE_ACCOUNT_URL = "/bcast/create/account/";
const BCAST_URL = "/bcast/";

function Timeline () { }

Timeline.prototype = {

  messages: [],

  index: {},

  get lastFetchedID() {
    return 0 || localStorage.getItem("lastFetchedID");
  },

  get lastFetchedTime(){
    return 0 || localStorage.getItem("lastFetchedTime");
  },

  fetch: function TL_fetch()
  {
    getMessages(this.lastFetchedID);
  }
};

$(document).ready(function() {
  // check for DOMCrypt
  checkDOMCrypt();
  // key bindings
  $("#search").keyup(function(e) {
    if (e.keyCode == '13') {
      var str = $("#search")[0].value;
      if (str) {
        new SearchAccounts(str);
      }
    }
    if (e.keyCode == 27) {
      $("#search")[0].value = "find people...";
      $("#results").children().remove();
      $("#search").blur();
    }
  });

  // focus events
  $("#search").focus(function (){
    if (this.value == "find people...") {
      this.value = "";
    }
  });

  $("#search").blur(function (){
    if (!(this.value == "find people...")) {
      this.value = "find people...";
    }
  });

  try {
    // TODO: account login/create account flow needed
    // // need to check for credentials, decrypt them and configure the application
    var _credentials = localStorage.getItem("credentials");

    if (!_credentials && document.location.pathname != CREATE_ACCOUNT_URL &&
        document.location.pathname != LOGIN_URL) {
      notify("account error", "It looks like you do not have an account yet, redirecting momentarily...", 5000, true);
         window.setTimeout(function (){
           document.location = CREATE_ACCOUNT_URL;
         }, 5000);
         return;
    }

    // only try to load the credentials if we are at the main page!
    if (document.location.pathname != "/bcast/") {
      return;
    }

    var credentials = JSON.parse(_credentials);
    // decrypt credentials
    mozCipher.pk.decrypt(credentials, function (plaintext){
      var credentialsPlainObj = JSON.parse(plaintext);
      // TODO: need to get follower_ids from the server

      messageComposer = new MessageComposer(credentialsPlainObj, []);
      timeline = new Timeline();
      timeline.fetch();

      // fetch updates every 5 minutes...
      window.setInterval(function (){ timeline.fetch(); }, 300000);
    });
  }
  catch (ex) {
    console.log(ex);
    console.log(ex.stack);
  }
});

function checkDOMCrypt()
{
  return;
  if (window.mozCipher) {
    // check for a pub key:
    mozCipher.pk.getPublicKey(function (aPubKey){
      if (!aPubKey) {
        notify("additional configuration is required", "Please create a passphrase that will secure your data");
        mozCipher.pk.generateKeypair(function (aPubKey){
          if (aPubKey) {
            alert("bcast configuration complete, next: create a server account...");
            document.location = "/bcast/create/account/?t=" + Date.now();
          }
        });
      }
    });
  }
  else {
    alert("DOMCrypt API (window.mozCipher) not detected. DOMCrypt is required to use bcast. Please visit http://domcrypt.org/ for installation instructions.");
  }
}

function MessageDisplay(aMessageData)
{
  aMessageData._id = aMessageData.id;
  // TODO: use the same keys for both db and locally created messages
  var tmpl;
  if (aMessageData.content) {
    // database template
    tmpl = '<div class="msg" id="{id}">'
      + '<div class="msg-date">{date_time} '
      + '<button id="read-one-{_id}" class="read-one" onclick="DisplayPlainText(this);">Read</button>'
      + '</div>'
      + '<div class="msg-author">{author_display_name}</div>'
      + '<div class="msg-content">{content}</div>'
      + '</div>';
  }
  else {
    tmpl = '<div class="msg" id="{id}">'
      + '<div class="msg-date">{date} '
      + '<button id="read-one-{_id}" class="read-one" onclick="DisplayPlainText(this);">Read</button>'
      + '</div>'
      + '<div class="msg-author">{author}</div>'
      + '<div class="msg-content">{cipherText}</div>'
      + '</div>';
  }

  var node = $(tmpl.printf(aMessageData));
  $("#msg-input")[0].value = "";
  $("#messages").prepend(node);
}

function DisplayPlainText(aNode)
{
  var id = aNode.parentNode.parentNode.getAttribute("id");
  new MessageReader(id);
}

function log(aMsg)
{
  if (DEBUG) {
    console.log(aMsg);
  }
}

function MessageComposer(aCredentials, aFollowers)
{
  // normally in the MessageComposer, you would:
  // 1. encrypt text
  // 2. get a list of all followers' hashIds and pubKeys
  // 3. wrapKeys for all followers
  // 4. push the message bundle to the server
  // In this demo we will just add the message to the timeline of the current user
  this.author = aCredentials.displayName;
  this.token = aCredentials.token;
  this.ID = aCredentials.ID;
  $("#display-name")[0].innerHTML = this.author;
  this.followers = aFollowers;
  var self = this;
  mozCipher.pk.getPublicKey(function (aPubKey){
    self.authorPubKey = aPubKey;
    self.followers.push({handle: self.author, pubKey: self.authorPubKey });
  });
  ///////////////////////////////////////////////////////////////////////////////
  // get followers...
  var url = "/bcast/_xhr/get/followers/?a1={a1}&a2={a2}&t={t}".
    printf({a1: self.ID, a2: self.token, t: Date.now()});
  var config = {
    url: url,
    dataType: "json",
    success: function success(data)
    {
      var len = data.followers.length;
      if (len > 0) {
        for (var i = 0; i < len; i++) {
          console.log("messageComposer: follower fetched: " + data.followers[i]);
          console.log(data.followers);
          window.followers.push(data.followers[i]);
        }
      }
      else {
        // just write to the console...
        log("messageComposer: no followers found");
      }
    }
  };
  $.ajax(config);
  // followers got!
  ////////////////////////////////////////////////////////////////////////////////
}

MessageComposer.prototype = {
  author: null,

  token: null,

  ID: null,

  authorPubKey: null,

  followers: [],

  // get followers() { return window.followers; },

  bundle: function mc_bundle(aCipherMessage)
  {
    try {

    console.log("bundle --->");
    console.log(aCipherMessage.idx);
    var self = this;
    var messages = [];
    var idx;
    var bundle = { cipherMsg: aCipherMessage,
                   identifier: self.ID,
                   author: self.author,
                   authorPubKey: self.authorPubKey
                 };
    // TODO: add authentication token and password to the bundle
    var len = window.followers.length;
    console.log(len);
    console.log("WINDOW FOLLOWERS:");
    console.log(window.followers);
    // need to re-wrap the key for each follower
    var lastIdx = window.followers.length;
    var _followers = window.followers;
    for (var i = 1; i < _followers.length; i++) {
      console.log(_followers[i].handle);
      mozCipher.sym.wrapKey(aCipherMessage, _followers[i].pubKey,
                            function wrapCallback(aCipherObj) {
        console.log(_followers[i].handle);
        aCipherObj.follower = _followers[i].handle;
        console.log("follower: " + aCipherObj.follower);
        messages.push(aCipherObj);
        if ((parseInt(i)) == parseInt(lastIdx)) {
          console.log("sending...");
          window.setTimeout(function (){
            self.send(bundle, messages);
          }, 2000);
        }
      });
    }

    } catch (ex) {
      console.log(ex);
      console.log(ex.stack);
    }
  },

  encrypt: function mc_encrypt()
  {
    var self = this;
    var followersLen = this.followers.length;
    mozCipher.sym.encrypt($("#msg-input")[0].value, function (aCipherMsg) {
      aCipherMsg.author = this.author;
      // TODO: send the bundle to the server...
      var date = new Date();
      var message = {author: self.author,
                     id: date.getTime(),
                     date: date.toString(),
                     cipherText: aCipherMsg.cipherText,
                     wrappedKey: aCipherMsg.wrappedKey,
                     iv: aCipherMsg.iv,
                     pubKey: aCipherMsg.pubKey,
                     idx: followersLen};

      var bundle = self.bundle(message);
    });
  },

  send: function mc_send(bundle, messages)
  {
    var self = this;
    var bundleStr = JSON.stringify(bundle);
    var messagesStr = JSON.stringify(messages);
    // TODO: HTTP POST to server
    console.log("SEND--->");
    var url = "/bcast/_xhr/post/msg/";
    var csrf_token = $('#csrf_token >div >input').attr("value");
    var config = {
      data: {
        a1: self.ID,
        a2: self.token,
        bundle: bundleStr,
        messages: messagesStr,
        csrfmiddlewaretoken: csrf_token
      },
      url: url,
      type: "POST",
      dataType: "json",
      success: function success(data)
      {
        if (data.msgId) {
          notify("success", "message sent");
        }
        else {
          console.log(data.msg);
          // TODO: keep a cache of the bundled message or ajax config in case
          // of a problem for re-sending
          notify("whoops", "message was not sent");
        }
      }
    };
    $.ajax(config);

  },

  validate: function mc_validate()
  {
    var txt = $("#msg-input")[0].value;
    if (txt.length > 0 && txt.length < 4096) {
      this.encrypt();
    }
    else {
      // XXX: notify user of error
    }
  }
};

function MessageReader(aMessageID)
{
  this.id = aMessageID;
  this.decrypt();
}

MessageReader.prototype = {
  decrypt: function mr_decrypt()
  {
    var self = this;
    var msg = timeline.index[this.id];
    var _msg;
    if (msg.content) { // this object came from the server, reconfigure it
      _msg = {
        cipherText: msg.content,
        iv: msg.iv,
        wrappedKey: msg.wrapped_key
      };
    }
    else {
      _msg = msg;
    }
    mozCipher.sym.decrypt(_msg, function (plainText) {
      var id = "#" + self.id;
      $(id)[0].childNodes[2].innerHTML =
        '<pre>{plainText}</pre>'.printf({plainText: plainText});
      // disable read button
      $("#read-one-" + self.id)[0].disabled = true;
    });
  }
};

// Account format and creation

function Account(aAccountData)
{
  if (!("display_name" in aAccountData)) {
    throw new Error("Display Name is required");
  }
  var url, bio = null;
  if (aAccountData.url) {
    url = aAccountData.url;
  }
  if (aAccountData.bio) {
    bio = aAccountData.bio;
  }
  this.accountData = {identifier: null,
                      login_token: null,
                      bio: bio,
                      url: url,
                      display_name: aAccountData.display_name,
                      pub_key: null
                     };
  this.configureAccount();
}

Account.prototype = {
  accountData: null,

  accountStatus: function a_accountStatus()
  {
    // check if this is a valid account and user can login
    // HTTP post the bcastAcct data that we have
    // the server will tell us if the account displayname is available
    // if it is we can create the account
  },

  configureAccount: function a_configureAccount()
  {
    var bcastAcct;
    var _bcast_acct = localStorage.getItem("BCAST_ACCT");
    if (_bcast_acct) {
      bcastAcct = JSON.parse(_bcast_acct);
      if (bcastAcct.login_token && bcastAcct.identifier) {
        // looks like this account is already ready to go
        console.log("Account is ready");
        return;
      }
      else if (bcastAcct.display_name) {
        // we need to see if the account can be created
        this.accountStatus(bcastAcct);
      }
    }
    var self = this;
    // TODO detect missing publickey, generate one
    mozCipher.pk.getPublicKey(function (aPubKey){
      self.accountData.pub_key = aPubKey;
      mozCipher.hash.SHA256(aPubKey, function (aHash){
        self.accountData.identifier = aHash;
        console.log("account configured");
      });
    });
  },

  createAccount: function a_createAccount()
  {

  },

  destroyAccount: function a_destroyAccount()
  {

  }
};

function SearchAccounts(aNameFragment)
{
  // search for display names to follow people
  var url = "/bcast/_xhr/search/accounts/?n=" + aNameFragment + "&rndm=" + Date.now();
  var config = {
    url: url,
    dataType: "json",
    success: function success(data)
    {
      var errTmpl = '<p class="search-error">{err}</p>';
      if (data.status == "success") {
        var tmpl = '<p class="search-result" id="{id}">'
                   + '<span>{display_name}</span> '
                   + '<a class="txt-btn" onclick="follow(this);">follow...</a> '
                   + '<a class="txt-btn" onclick="block(this);">*block*</a>'
                   + '</p>';
        $("#results").children().remove();
        // display the names found in the results div
        for (var i = 0; i < data.msg.length; i++) {
          // TODO: do not allow following of yourself:)
          $("#results").append($(tmpl.printf(data.msg[i])));
        }
      }
      else {
        $("#results").children().remove();
        notify(null, "not found", null, true);
      }
    }
  };
  $.ajax(config);
}

function follow(aNode)
{
  // get the id via the node's parent.parent.id
  var id = aNode.parentNode.getAttribute("id");

  // xhr that request up to the server
  var url = "/bcast/_xhr/follow/?leader=" + id + "&follower=" + messageComposer.ID;
  var config = {
    url: url,
    dataType: "json",
    success: function success(data)
    {
      var name = aNode.parentNode.childNodes[0].innerHTML;
      if (data.status == "success") {
        var msg = "follow request sent to '" + name + "'";
        notify("success", msg);
        // TODO: add the user to a 'following' list
      }
      else if (data.msg == "FOLLOWING") {
        notify("already following", name);
      }
      else if (data.msg == "CANNOT_FOLLOW_YOURSELF") {
        notify("you cannot follow", "you");
      }
      else {
        notify("server error",  "'follow' request failed");
      }
    }
  };
  $.ajax(config);
}

function block(aNode)
{

}

function showFollowing()
{
  var url = "/bcast/_xhr/get/following/?a1={a1}&a2={a2}&t={t}".
    printf({a1: messageComposer.ID, a2: messageComposer.token, t: Date.now()});
  var config = {
    url: url,
    dataType: "json",
    success: function success(data)
    {
      var len = data.following.length;
      if (len > 0) {
        $("#results").children().remove();
        $("#results").append($("<h3>... following ...</h3>"));
        var tmpl = '<div>{handle}</div>';
        for (var i = 0; i < len; i++) {
          $("#results").append($(tmpl.printf(data.following[i])));
        }
      }
      else {
        notify("You are not following", "anyone");
      }
    }
  };
  $.ajax(config);
}

function showFollowers()
{
  var url = "/bcast/_xhr/get/followers/?a1={a1}&a2={a2}&t={t}".
    printf({a1: messageComposer.ID, a2: messageComposer.token, t: Date.now()});
  var config = {
    url: url,
    dataType: "json",
    success: function success(data)
    {
      var len = data.followers.length;
      if (len > 0) {
        $("#results").children().remove();
        $("#results").append($("<h3>... current followers ...</h3>"));
        var tmpl = '<div>{handle}</div>';
        for (var i = 0; i < len; i++) {
          $("#results").append($(tmpl.printf(data.followers[i])));
        }
      }
      else {
        notify("No one is following", "you");
      }
    }
  };
  $.ajax(config);
}

function getMessages(aLastFetchedID)
{
  if (!localStorage.getItem("credentials")) {
    // user has never logged in yet, do not attempt to fetch messages
    return;
  }
  var url =  "/bcast/_xhr/get/msgs/?a1={a1}&a2={a2}".
    printf({a1: messageComposer.ID, a2: messageComposer.token});

  if (aLastFetchedID) {
    url = url + "&lastid={lastfetched}".printf({lastfetched: aLastFetchedID});
  }
  var config = {
    url: url,
    dataType: "json",
    success: function success (data)
    {
      var len = data.msg.length;
      var lastMsgIdx;
      if (data.status == "success") {
        // display the messages by prepending them to #messages
        var _id;
        for (var i = 0; i < data.msg.length; i++) {
          MessageDisplay(data.msg[i]);
          _id = data.msg[i].id;
          timeline.index[_id] = data.msg[i];
          timeline.messages.push(data.msg[i]);
          // TODO: do not write this on every message pull!
          localStorage.setItem("lastFetchedID", data.msg[i].id);
          localStorage.setItem("lastFetchedTime", Date.now());
        }
      }
      if (len < 0) {
        notify("no timeline messages to fetch", null);
      }
    }
  };
  $.ajax(config);
}

// Utilities

function notify(aTitle, aMsg, aDuration, aError) {
  var skin = "rounded";
  var duration;
  if (aDuration) {
    duration = aDuration;
  }
  if (aError) {
    skin = skin + ",red";
  }
  $.notifier.broadcast(
    {
	    ttl: aTitle,
		  msg: aMsg,
      skin: skin,
      duration: duration
	  }
  );
}


// printf
String.prototype.printf = function (obj) {
  var useArguments = false;
  var _arguments = arguments;
  var i = -1;
  if (typeof _arguments[0] == "string") {
    useArguments = true;
  }
  if (obj instanceof Array || useArguments) {
    return this.replace(/\%s/g,
    function (a, b) {
      i++;
      if (useArguments) {
        if (typeof _arguments[i] == 'string') {
          return _arguments[i];
        }
        else {
          throw new Error("Arguments element is an invalid type");
        }
      }
      return obj[i];
    });
  }
  else {
    return this.replace(/{([^{}]*)}/g,
    function (a, b) {
      var r = obj[b];
      return typeof r === 'string' || typeof r === 'number' ? r : a;
    });
  }
};
