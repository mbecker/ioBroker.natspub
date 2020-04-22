"use strict";

/*
 * Created with @iobroker/create-adapter v1.24.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");

// Load your modules here, e.g.:
const NATS = require("nats");
// let nc = null;

// Counter subscribed ioBroker states
let cnt = 0;

class Natspub extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "natspub",
		});
		this.on("ready", this.onReady.bind(this));
		this.on("objectChange", this.onObjectChange.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));

		this.nc = null;
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		// Reset the connection indicator during startup
		this.setState("info.connection", false, true);

		// The adapters config (in the instance object everything under the attribute "native") is accessible via
		// this.config:
		this.log.info("config option1: " + this.config.option1);
		this.log.info("config option2: " + this.config.option2);

		/*
		For every state in the system there has to be also an object of type state
		Here a simple template for a boolean variable named "testVariable"
		Because every adapter instance uses its own unique namespace variable names can't collide with other adapters variables
		*/
		await this.setObjectAsync("testVariable", {
			type: "state",
			common: {
				name: "testVariable",
				type: "boolean",
				role: "indicator",
				read: true,
				write: true,
			},
			native: {},
		});

		// in this template all states changes inside the adapters namespace are subscribed
		this.subscribeStates("*");

		/*
		setState examples
		you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
		// the variable testVariable is set to true as command (ack=false)
		await this.setStateAsync("testVariable", true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		await this.setStateAsync("testVariable", {
			val: true,
			ack: true
		});

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		await this.setStateAsync("testVariable", {
			val: true,
			ack: true,
			expire: 30
		});

		// examples for the checkPassword/checkGroup functions
		let result = await this.checkPasswordAsync("admin", "iobroker");
		this.log.info("check user admin pw iobroker: " + result);

		result = await this.checkGroupAsync("admin", "admin");
		this.log.info("check group user admin group admin: " + result);

		/*
		 * NATS
		 */

		// Connect with username and password in the url
		this.nc = NATS.connect({
			url: "nats://176.9.51.15:4222",
			user: "",
			pass: "",
			json: true,
			maxReconnectAttempts: this.config.reconnectMaxReconnectAttempts,
			reconnectTimeWait: this.config.reconnectTimeWait
		});
		// NATS event "connect" callback provides a reference to the connection as an argument
		this.nc.on("connect", () => {
			// NATS events
			// https://github.com/nats-io/nats.js#events

			// emitted whenever there's an error. if you don't implement at least
			// the error handler, your program will crash if an error is emitted.
			this.nc.on("error", (err) => {
				this.log.error(err);
			});
			
			// emitted whenever the client disconnects from a server
			this.nc.on("disconnect", () => {
				this.log.info("disconnect");
			});

			// emitted whenever the client is attempting to reconnect
			this.nc.on("reconnecting", () => {
				this.log.info("reconnecting");
			});

			// emitted whenever the client reconnects
			// reconnect callback provides a reference to the connection as an argument
			this.nc.on("reconnect", (nc) => {
				this.log.info(`reconnect to ${nc.currentServer.url.host}`);
			});

			// emitted when the connection is closed - once a connection is closed
			// the client has to create a new connection.
			this.nc.on("close", function () {
				this.log.info("close");
			});

			// emitted whenever the client unsubscribes
			this.nc.on("unsubscribe", function (sid, subject) {
				this.log.info("unsubscribed subscription [" + sid + "] for subject [" + subject + "]");
			});

			// emitted whenever the server returns a permission error for
			// a publish/subscription for the current user. This sort of error
			// means that the client cannot subscribe and/or publish/request
			// on the specific subject
			this.nc.on("permission_error", function (err) {
				this.log.error("got a permissions error: " + err.message);
			});

			this.log.info(`Connected to NATS server: [${this.nc.currentServer.url.host}]`);
			this.setState("info.connection", true, true);

		});

		// Subscirbe to ioBroker states
		if (this.config.publish) {
			const publishParts = this.config.publish.split(",");
			for (let t = 0; t < publishParts.length; t++) {
				// TODO: Do we need to look for MQTT patterns
				if (publishParts[t].indexOf("#") !== -1) {
					this.log.warn("Used MQTT notation for ioBroker in pattern '" + publishParts[t] + "': use '" + publishParts[t].replace(/#/g, "*") + " notation");
					publishParts[t] = publishParts[t].replace(/#/g, "*");
				}
				this.log.info("Subscribe to state(s): " + publishParts[t].trim());
				this.subscribeForeignStates(publishParts[t].trim());

				cnt++;
				// readStatesForPattern(publishParts[t]);
			}
		}
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			this.log.info("cleaned everything up...");
			callback();
		} catch (e) {
			callback();
		}
	}

	/**
	 * Is called if a subscribed object changes
	 * @param {string} id
	 * @param {ioBroker.Object | null | undefined} obj
	 */
	onObjectChange(id, obj) {
		if (obj) {
			// The object was changed
			this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
		} else {
			// The object was deleted
			this.log.info(`object ${id} deleted`);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			// this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
			if (this.nc === null) return;
			const subject = this.config.topicPrefix + id;
			this.nc.publish(subject, state, () => {
				if(this.config.developerLogging) this.log.info("Published [" + subject + "] : " + JSON.stringify(state) + ")");
			});
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.message" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Natspub(options);
} else {
	// otherwise start the instance directly
	new Natspub();
}