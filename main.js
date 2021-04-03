'use strict';

/*
 * Created with @iobroker/create-adapter v1.21.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const rgbHex = require('rgb-hex'); // Lib to translate rgb to hex
const hexRgb = require('hex-rgb'); // Lib to translate hex to rgb
const {default: axios} = require('axios'); // Lib to handle http requests

const stateAttr = require('./lib/stateAttr.js'); // Load attribute library
const bonjour = require('bonjour')(); // load Bonjour library

let polling = null; // Polling timer
let scan_timer = null; // reload = false;
let timeout = null; // Refresh delay for send state
const stateExpire = {}, warnMessages = {}, initialise = {}; // Timers to reset online state of device

const disableSentry = false; // Ensure to set to true during development !

class Wled extends utils.Adapter {

	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'wled',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		this.on('unload', this.onUnload.bind(this));
		this.on('message', this.onMessage.bind(this));
		this.devices = {};
		this.effects = {};
		this.palettes = {};
		this.createdStatesDetails = {};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Read already known devices
		await this.tryKnownDevices();

		// Run Autodetect (Bonjour - Service, mDNS to be handled)
		await this.scanDevices();

		// Connection state to online when adapter is ready to connect to devices
		this.setState('info.connection', true, true);
		this.log.info('WLED initialisation finalized, ready to do my job have fun !');

		// Start Polling timer
		this.polling_timer();

	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {

		// Clear running polling timers
		if (scan_timer) {
			clearTimeout(scan_timer);
			scan_timer = null;
		}

		if (polling) {
			clearTimeout(polling);
			polling = null;
		}

		if (timeout) {
			clearTimeout(timeout);
			timeout = null;
		}

		// Set all online states to false
		for (const i in this.devices) {
			this.setState(this.devices[i] + '._info' + '._online', {val: false, ack: true});
		}

		try {
			callback();
			this.log.info('cleaned everything up...');
			this.setState('info.connection', false, true);
		} catch (error) {
			this.log.error('Error at adapter stop : ' + error);
			this.setState('info.connection', false, true);
			callback();
		}

	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {

		if (state && state.ack === false) {
			// The state was changed and is not (yet) acknowledged
			this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			// Split state name in segments to be used later
			const deviceId = id.split('.');

			// Prepare array's needed to send new states
			let values = null, rgb_all = null;

			// Build send command for state changes
			if (deviceId[4] === undefined) {
				this.log.debug('Send state');
				values = {
					[deviceId[3]]: state.val
				};
				this.log.debug('values 4 ' + JSON.stringify(values));

			} else {

				// Send command 1 - level  nesting
				if (deviceId[5] === undefined) {

					this.log.debug('Send nested state');

					// Send state change & value strate forward to WLED API
					values = {
						[deviceId[3]]: {
							[deviceId[4]]: state.val
						}
					};
					this.log.debug('values 5 ' + JSON.stringify(values));
				}

				// Handle segments logic
				if (deviceId[3] === 'seg') {
					this.log.debug('Send seg');
					const valAsNumbers = parseFloat(deviceId[4]);
					this.log.debug('test number : ' + valAsNumbers);

					// Check if changed state is related to color
					if (deviceId[5] === 'col') {
						this.log.debug('Send col');
						const color_root = deviceId[2] + '.' + deviceId[3] + '.' + deviceId[4] + '.' + deviceId[5];
						this.log.debug(color_root);

						// Handle logic for HEX values, must be translated to RGB which is used by WLED
						if (deviceId[6] === '0_HEX' || deviceId[6] === '1_HEX' || deviceId[6] === '2_HEX') {

							this.log.debug('HEX color change initiated, convert to RGB and send data');

							try {

								// Get all 3 HEX values from states
								const colorPrimaryHex = await this.getStateAsync(color_root + '.0_HEX');
								if (!colorPrimaryHex) return;
								const colorSecondaryHex = await this.getStateAsync(color_root + '.1_HEX');
								if (!colorSecondaryHex) return;
								const colorTertiaryHex = await this.getStateAsync(color_root + '.1_HEX');
								if (!colorTertiaryHex) return;

								// Use library to translate HEX values into propper RGB
								const colorPrimaryRGB = hexRgb(colorPrimaryHex.val);
								const colorSecondaryRGB = hexRgb(colorSecondaryHex.val);
								const colorTertiaryRGB = hexRgb(colorTertiaryHex.val);

								// Build RGB JSON string to be send to WLED
								rgb_all = [
									[colorPrimaryRGB.red, colorPrimaryRGB.green, colorPrimaryRGB.blue],
									[colorSecondaryRGB.red, colorSecondaryRGB.green, colorSecondaryRGB.blue],
									[colorTertiaryRGB.red, colorTertiaryRGB.green, colorTertiaryRGB.blue]
								];

								this.log.debug('Converted RGB values of HEX input : ' + colorPrimaryRGB + ' : ' + colorSecondaryRGB + ' : ' + colorTertiaryRGB);

							} catch (error) {
								this.log.error('Hex conversion failed : ' + error);
								return;
							}

							// Handle logic for RGB values, must be translated to RGB which is used by WLED
						} else if ((deviceId[6] === '0' || deviceId[6] === '1' || deviceId[6] === '2')) {

							this.log.debug('RGB color change initiated, convert to RGB and send data');

							try {

								// Get all 3 RGB values from states and ensure all 3 color's are always submitted in 1 JSON string !
								let color_primary = await this.getStateAsync(color_root + '.0');
								if (!color_primary) return;
								this.log.debug('Primmary color before split : ' + color_primary.val);
								try {
									color_primary = color_primary.val.split(',').map(s => parseInt(s));
								} catch (error) {
									if (!color_primary) return;
									color_primary = color_primary.val;
								}

								let color_secondary = await this.getStateAsync(color_root + '.1');
								if (!color_secondary) return;
								this.log.debug('Secondary color : ' + color_secondary.val);
								try {
									color_secondary = color_secondary.val.split(',').map(s => parseInt(s));
								} catch (error) {
									if (!color_secondary) return;
									color_secondary = color_secondary.val;
								}

								let color_tertiary = await this.getStateAsync(color_root + '.2');
								if (!color_tertiary) return;
								this.log.debug('Tertary color : ' + color_tertiary.val);
								try {
									color_tertiary = color_tertiary.val.split(',').map(s => parseInt(s));
								} catch (error) {
									if (!color_tertiary) return;
									color_tertiary = color_tertiary.val;
								}

								this.log.debug('Color values from states : ' + color_primary + ' : ' + color_secondary + ' : ' + color_tertiary);

								// Build propper RGB array in WLED format with alle 3 color states
								rgb_all = [color_primary, color_secondary, color_tertiary];

							} catch (error) {
								this.log.error(error);
								return;
							}

						}

						// Build JSON string to be send to WLED, cancell function if
						values = {
							'seg': {
								'id': valAsNumbers,
								'col': rgb_all
							}
						};

					} else {

						// Send state change & value strate forward to WLED API
						values = {
							[deviceId[3]]: {
								id: valAsNumbers,
								[deviceId[5]]: state.val
							}
						};

					}
					this.log.debug('values segment ' + JSON.stringify(values));
				}
			}

			this.log.debug('Prepare API call for device : ' + deviceId[2] + ' and values + ' + values);
			let device_ip = await this.getForeignObjectAsync('wled.' + this.instance + '.' + deviceId[2]);
			if (!device_ip) return;
			device_ip = device_ip.native.ip;

			// Only make API call when values are correct
			if (values !== null && device_ip !== null) {

				// Send API Post command
				const result = await this.postAPI('http://' + device_ip + '/json', values);
				if (!result) return;
				this.log.debug('API feedback' + JSON.stringify(result));

				if (result.success === true) {
					// Set state aknowledgement if  API call was succesfully
					this.setState(id, {
						val: state.val,
						ack: true
					});

					// Run Polling of all values with delay to ensure states are updated after changes
					(function () {
						if (timeout) {
							clearTimeout(timeout);
							timeout = null;
						}
					})();
					timeout = setTimeout(() => {
						this.readData(device_ip);
					}, 150);

				}
			}

		} else {
			// The state was deleted
			// 	this.log.info(`state ${id} deleted`);
		}
	}

	/**
	 * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	 * Using this method requires "common.message" property to be set to true in io-package.json
	 * @param {ioBroker.Message} obj
	 */
	async onMessage(obj) {

		// responds to the adapter that sent the original message
		function respond(response, that) {
			if (obj.callback)
				that.sendTo(obj.from, obj.command, response, obj.callback);
		}

		this.log.debug('Data from configuration received : ' + JSON.stringify(obj));

		switch (obj.command) {
			case 'addDevice':
				// Disable check of const declaration in case function
				// eslint-disable-next-line no-case-declarations
				const result = await this.readData(obj.message);
				this.log.debug('Response from Read Data : ' + JSON.stringify(result));
				if (result === 'success') {
					respond('success', this);
					// Add new device to array ensuring data polling at intervall time
					this.devices[obj.message] = 'xxx';
				} else {
					respond('failed', this);
				}
				break;
		}

	}

	// Read WLED API of device and store all values in states
	async readData(index, device_id) {
		// Read WLED API, trow warning in case of issues
		// const objArray = await this.getAPI('http://' + index + '/json');
		const deviceInfo = await this.getAPI('http://' + index + '/json/info');
		if (!deviceInfo) {
			this.log.debug('Info API call error, will retry in scheduled interval !');
			return 'failed';
		} else {
			this.log.debug('Info Data received from WLED device ' + JSON.stringify(deviceInfo));
		}

		try {
			const device_id = deviceInfo.mac;

			// Create Device, channel id by MAC-Adress and ensure relevant information for polling and instance configuration is part of device object
			await this.extendObjectAsync(device_id, {
				type: 'device',
				common: {
					name: deviceInfo.name
				},
				native: {
					ip: index,
					mac: deviceInfo.mac,
				}
			});

			// Update device working state
			await this.create_state(device_id + '._info' + '._online', 'online', true);

			// Read info Channel
			for (const i in deviceInfo) {

				this.log.debug('Datatype : ' + typeof (deviceInfo[i]));

				// Create Info channel
				await this.setObjectNotExistsAsync(device_id + '._info', {
					type: 'channel',
					common: {
						name: 'Basic information',
					},
					native: {},
				});

				// Create Channels for led and  wifi configuration
				switch (i) {
					case ('leds'):
						await this.setObjectNotExistsAsync(device_id + '._info.leds', {
							type: 'channel',
							common: {
								name: 'LED stripe configuration	',
							},
							native: {},
						});
						break;

					case ('wifi'):
						await this.setObjectNotExistsAsync(device_id + '._info.wifi', {
							type: 'channel',
							common: {
								name: 'Wifi configuration	',
							},
							native: {},
						});
						break;

					default:

				}

				// Create states, ensure object structures are reflected in tree
				if (typeof (deviceInfo[i]) !== 'object') {

					// Default channel creation
					this.log.debug('State created : ' + i + ' : ' + JSON.stringify(deviceInfo[i]));
					await this.create_state(device_id + '._info.' + i, i, deviceInfo[i]);

				} else {
					for (const y in deviceInfo[i]) {
						this.log.debug('State created : ' + y + ' : ' + JSON.stringify(deviceInfo[i][y]));
						await this.create_state(device_id + '._info.' + i + '.' + y, y, deviceInfo[i][y]);
					}
				}

			}

			// Get effects (if not already in memory
			if (!this.effects[device_id]){
				initialise[device_id] = true;
				const effects = await this.getAPI('http://' + index + '/json/eff');
        if (this.IsJsonString(effects)) {        // arteck
  				if (!effects) {
  					this.log.debug('Effects API call error, will retry in scheduled interval !');
  				} else {
  					this.log.debug('Effects Data received from WLED device ' + JSON.stringify(effects));
  					// Store effects array
  					this.effects[device_id] = {};
  					for (const i in effects) {
  						this.effects[device_id][i] = effects[i];
  					}
  				}
        }
			}

			// Get pallets (if not already in memory
			if (!this.palettes[device_id]) {
				initialise[device_id] = true;
				const pallets = await this.getAPI('http://' + index + '/json/pal');
				if (!pallets) {
					this.log.debug('Effects API call error, will retry in scheduled interval !');
				} else {
					this.log.debug('Effects Data received from WLED device ' + JSON.stringify(pallets));
					// Store effects array
					this.palettes[device_id] = {};
					// Store pallet array
					for (const i in pallets) {
						this.palettes[device_id][i] = pallets[i];
					}
				}
			}

			// Read state Channel
			const deviceStates = await this.getAPI('http://' + index + '/json/state');
			for (const i in deviceStates) {

				this.log.debug('Datatype : ' + typeof (deviceStates[i]));

				// Create Channels for nested states
				switch (i) {
					case ('ccnf'):
						await this.setObjectNotExistsAsync(device_id + '.ccnf', {
							type: 'channel',
							common: {
								name: 'ccnf',
							},
							native: {},
						});
						break;

					case ('nl'):
						await this.setObjectNotExistsAsync(device_id + '.nl', {
							type: 'channel',
							common: {
								name: 'Nightlight',
							},
							native: {},
						});
						break;

					case ('udpn'):
						await this.setObjectNotExistsAsync(device_id + '.udpn', {
							type: 'channel',
							common: {
								name: 'Broadcast (UDP sync)',
							},
							native: {},
						});
						break;

					case ('seg'):

						this.log.debug('Segment Array : ' + JSON.stringify(deviceStates[i]));

						await this.setObjectNotExistsAsync(device_id + '.seg', {
							type: 'channel',
							common: {
								name: 'Segmentation',
							},
							native: {},
						});

						for (const y in deviceStates[i]) {

							await this.setObjectNotExistsAsync(device_id + '.seg.' + y, {
								type: 'channel',
								common: {
									name: 'Segment ' + y,
								},
								native: {},
							});

							for (const x in deviceStates[i][y]) {
								this.log.debug('Object states created for channel ' + i + ' with parameter : ' + y + ' : ' + JSON.stringify(deviceStates[i][y]));

								if (x !== 'col') {

									await this.create_state(device_id + '.' + i + '.' + y + '.' + x, x, deviceStates[i][y][x]);

								} else {
									this.log.debug('Naming  : ' + x + ' with content : ' + JSON.stringify(deviceStates[i][y][x][0]));

									// Translate RGB values to HEX
									const primaryRGB = deviceStates[i][y][x][0].toString().split(',');
									const primaryHex = rgbHex(parseInt(primaryRGB[0]), parseInt(primaryRGB[1]), parseInt(primaryRGB[2]));
									const secondaryRGB = deviceStates[i][y][x][1].toString().split(',');
									const secondaryHex = rgbHex(parseInt(secondaryRGB[0]), parseInt(secondaryRGB[1]), parseInt(secondaryRGB[2]));
									const tertiaryRGB = deviceStates[i][y][x][2].toString().split(',');
									const tertiaryHex = rgbHex(parseInt(tertiaryRGB[0]), parseInt(tertiaryRGB[1]), parseInt(tertiaryRGB[2]));

									// Write RGB and HEX information to states
									await this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.0', 'Primary Color RGB', deviceStates[i][y][x][0]);
									await this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.0_HEX', 'Primary Color HEX', '#' + primaryHex);
									await this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.1', 'Secondary Color RGB (background)', deviceStates[i][y][x][1]);
									await this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.1_HEX', 'Secondary Color HEX (background)', '#' + secondaryHex);
									await this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.2', 'Tertiary Color RGB', deviceStates[i][y][x][2]);
									await this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.2_HEX', 'Tertiary Color HEX', '#' + tertiaryHex);
								}
							}
						}

						break;

					default:

				}

				// Create states, ensure object structures are reflected in tree
				if (typeof (deviceStates[i]) !== 'object') {

					// Default channel creation
					this.log.debug('Default state created : ' + i + ' : ' + JSON.stringify(deviceStates[i]));
					await this.create_state(device_id + '.' + i, i, deviceStates[i]);

				} else {

					for (const y in deviceStates[i]) {
						if (typeof (deviceStates[i][y]) !== 'object') {
							this.log.debug('Object states created for channel ' + i + ' with parameter : ' + y + ' : ' + JSON.stringify(deviceStates[i][y]));
							await this.create_state(device_id + '.' + i + '.' + y, y, deviceStates[i][y]);
						}
					}
				}
			}

			// Create additional states not included in JSON-API of WLED but available as SET command
			await this.create_state(device_id + '.tt', 'tt', null);
			await this.create_state(device_id + '.psave', 'psave', null);
			await this.create_state(device_id + '.udpn.nn', 'nn', null);
			await this.create_state(device_id + '.time', 'time', null);

			return 'success';

		} catch (error) {

			// Set alive state to false if data read fails
			await this.setStateAsync(this.devices[index] + '._info' + '._online', {
				val: false,
				ack: true
			});
			this.log.error('Read Data error : ' + error);
			return 'failed';
		}
	}

	async polling_timer() {

		this.log.debug('polling timer for  devices : ' + JSON.stringify(this.devices));

		// Run true array of known devices and initiate API calls retrieving all information
		for (const i in this.devices) {

			await this.readData(i);
			this.log.debug('Getting data for ' + this.devices[i]);

		}

		// Reset timer (if running) and start new one for next polling intervall
		if (polling) {
			clearTimeout(polling);
			polling = null;
		}
		polling = setTimeout(() => {
			this.polling_timer();
		}, (this.config.Time_Sync * 1000));

	}

	// API get call from WLED device
	async getAPI(url) {
		this.log.debug('GET API called for : ' + url);
		try {
			const response = await axios.get(url, {timeout: 3000}); // Timout of 3 seconds for API call
			this.log.debug(JSON.stringify('API response data : ' + response.data));
			return response.data;
		} catch (error) {
			// this.log.error(error);
		}
	}

	// API post call to WLED device
	async postAPI(url, values) {
		this.log.debug('Post API called for : ' + url + ' and  values : ' + JSON.stringify(values));
		try {
			const result = axios.post(url, values)
				.then((response) => {
					return response.data;
				})
				.catch((error) => {
					this.log.error('Sending command to WLED device + ' + url + ' failed with error ' + error);
					return error;
				});
			return result;
		} catch (error) {
			this.log.error(error);
		}
	}

	// Try to contact to contact and read data of already known devices
	async tryKnownDevices() {

		const knownDevices = await this.getDevicesAsync();
		if (!knownDevices) return; // exit function if no known device are detected
		this.log.info('Try to contact known devices');

		// Get IP-Adress of known devices and start reading data
		for (const i in knownDevices) {
			const deviceName = knownDevices[i].common.name;
			const deviceIP = knownDevices[i].native.ip;
			const deviceMac = knownDevices[i].native.mac;

			this.log.info('Try to contact : "' + deviceName + '" on IP : ' + deviceIP);

			// Add IP adress to polling array
			this.devices[knownDevices[i].native.ip] = deviceMac;
			// Refresh information
			const result = await this.readData(deviceIP);

			// Error handling
			if (!result || result === 'failed') {
				this.log.warn('Unable to connect to device : ' + deviceName + ' on IP : ' + deviceIP + ' Will retry at interval time');
			} else {
				this.log.info('Device : "' + deviceName + '" Successfully connected on IP : ' + deviceIP);
			}
		}
	}

	// Scan network  with Bonjour service and build array for data-polling
	async scanDevices() {
		// Browse and listen for WLED devices
		const browser = await bonjour.find({
			'type': 'wled'
		});
		this.log.info('Bonjour service startet, new  devices  will  be detected automatically :-) ');

		// Event listener if new devices are detected
		browser.on('up', (data) => {
			const id = data.txt.mac;
			const ip = data.referer.address;

			// Check if device is already know
			if (this.devices[ip] === undefined) {
				this.log.info('New WLED  device found ' + data.name + ' on IP ' + data.referer.address);

				//  Add device to array
				this.devices[ip] = id;
				this.log.debug('Devices array from bonjour scan : ' + JSON.stringify(this.devices));

				// Initialize device
				this.readData(ip);
			} else {
				// Update memory with current ip address
				this.devices[ip] = id;
			}

			this.log.debug('Devices array from bonjour scan : ' + JSON.stringify(this.devices));
		});

	}

	async create_state(stateName, name, value) {
		this.log.debug('Create_state called for : ' + stateName + ' with value : ' + value);
		let deviceId = stateName.split('.');
		deviceId = deviceId[0];

		try {

			// Try to get details from state lib, if not use defaults. throw warning is states is not known in attribute list
			const common = {};
			if (!stateAttr[name]) {
				const warnMessage = `State attribute definition missing for : ${name} with value : ${value} `;
				if (warnMessages[name] !== warnMessage) {
					warnMessages[name] = warnMessage;
					// Log error messages disabled, sentry only
					// console.warn(warnMessage);
					// this.log.warn(warnMessage);

					// Send information to Sentry
					this.sendSentry(warnMessage);
				}
			}

			common.name = stateAttr[name] !== undefined ? stateAttr[name].name || name : name;
			common.type = stateAttr[name] !== undefined ? stateAttr[name].type || typeof (value) : typeof (value) ;
			common.role = stateAttr[name] !== undefined ? stateAttr[name].role || 'state' : 'state';
			common.read = true;
			common.unit = stateAttr[name] !== undefined ? stateAttr[name].unit || '' : '';
			common.write = stateAttr[name] !== undefined ? stateAttr[name].write || false : false;

			if ((!this.createdStatesDetails[stateName])
				|| (this.createdStatesDetails[stateName]
					&& (
						common.name !== this.createdStatesDetails[stateName].name
						|| common.name !== this.createdStatesDetails[stateName].name
						|| common.type !== this.createdStatesDetails[stateName].type
						|| common.role !== this.createdStatesDetails[stateName].role
						|| common.read !== this.createdStatesDetails[stateName].read
						|| common.unit !== this.createdStatesDetails[stateName].unit
						|| common.write !== this.createdStatesDetails[stateName].write
					)
				)) {

				// console.log(`An attribute has changed : ${state}`);
				this.log.info(`An attribute has changed : ${stateName} | old ${this.createdStatesDetails[stateName]}| new ${JSON.stringify(common)}`);

				await this.extendObjectAsync(stateName, {
					type: 'state',
					common
				});

			} else {
				// console.log(`Nothing changed do not update object`);
			}

			// Store current object definition to memory
			this.createdStatesDetails[stateName] = common;

			// Set value to state including expiration time
			if (value !== null || value !== undefined) {
				await this.setStateChangedAsync(stateName, {
					val: value,
					ack: true,
				});
			}

			// Timer  to set online state to  FALSE when not updated during  2 time-sync intervals
			if (name === 'online') {
				// Clear running timer
				if (stateExpire[stateName]) {
					clearTimeout(stateExpire[stateName]);
					stateExpire[stateName] = null;
				}

				// timer
				stateExpire[stateName] = setTimeout(async () => {
					// Set value to state including expiration time
					await this.setState(stateName, {
						val: false,
						ack: true,
					});
					this.log.debug('Online state expired for ' + stateName);
				}, this.config.Time_Sync * 2000);
				this.log.debug('Expire time set for state : ' + name + ' with time in seconds : ' + this.config.Time_Sync * 2);
			}

			// Extend effects and color pal`let  with dropdown menu
			if (name === 'fx' && this.effects[deviceId] && initialise[deviceId]) {

				this.log.debug('Create special drop down state with value ' + JSON.stringify(this.effects));
				await this.extendObjectAsync(stateName, {
					type: 'state',
					common: {
						states: this.effects[deviceId]
					}
				});

			} else if (name === 'pal' && this.palettes[deviceId] && initialise[deviceId]) {


				// this.log.debug('Create special drop down state with value ' + JSON.stringify(this.effects));
				await this.extendObjectAsync(stateName, {
					type: 'state',
					common: {
						states: this.palettes[deviceId]
					}
				});
			}

			// Subscribe on state changes if writable
			common.write && this.subscribeStates(stateName);

		} catch (error) {
			this.log.error('Create state error = ' + error);
		}
	}

	sendSentry(msg) {

		if (!disableSentry) {
			this.log.info(`[Error catched and send to Sentry, thank you collaborating!] error: ${msg}`);
			if (this.supportsFeature && this.supportsFeature('PLUGINS')) {
				const sentryInstance = this.getPluginInstance('sentry');
				if (sentryInstance) {
					sentryInstance.getSentryObject().captureException(msg);
				}
			}
		}else {
			this.log.error(`Sentry disabled, error catched : ${msg}`);
			console.error(`Sentry disabled, error catched : ${msg}`);
		}
	}

  IsJsonString(str) {
    try {
        JSON.parse(str);
    } catch (e) {
        return false;
    }
    return true;
  }

}

// @ts-ignore parent is a valid property on module
if (module.parent) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<ioBroker.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Wled(options);
} else {
	// otherwise start the instance directly
	new Wled();
}
