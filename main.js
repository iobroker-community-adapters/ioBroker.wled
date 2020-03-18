'use strict';

/*
 * Created with @iobroker/create-adapter v1.21.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
const axios = require('axios');
const rgbHex = require('rgb-hex'); // Lib to translate rgb to hex
const hexRgb = require('hex-rgb'); // Lib to translate hex to rgb

const stateAttr = require(__dirname + '/lib/stateAttr.js');
const bonjour = require('bonjour')();
// const fs = require('fs');

let polling; // Polling timer
let scan_timer; // reload = false;
let timeout = null;

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
		this.devices = {};
		this.devices_test = {};
		this.effects = {};
		this.palettes = {};
	}

	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {

		// Run Autodetect (Bonjour - Service, mDNS to be handled)
		await this.scan_devices();

		// Connection state to online when adapter is ready to connect devices
		this.setState('info.connection', true, true);
	}

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		
		// Clear running polling timers
		if (scan_timer) {clearTimeout(scan_timer); scan_timer = null;}
		if (polling) {clearTimeout(polling); polling = null;}
		try {
			this.log.debug('cleaned everything up...');
			this.setState('info.connection', false, true);
			callback();
		} catch (error) {
			callback();
			this.log.error('Error at adapter stop : ' + error);
		}
	}

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		if (state  && state.ack === false) {
			
			// The state was changed
			this.log.debug(`state ${id} changed: ${state.val} (ack = ${state.ack})`);

			const deviceId = id.split('.');
			this.log.silly('x row contet 2 : ' + deviceId[2]);
			this.log.silly('x row contet 3 : ' + deviceId[3]);
			this.log.silly('x row contet 4 : ' + deviceId[4]);
			this.log.silly('x row contet 5 : ' + deviceId[5]);
			this.log.silly('x row contet 6 : ' + deviceId[6]);
			this.log.silly('x row contet 7 : ' + deviceId[7]);

			const device = this.devices[deviceId[2]];
			let values = null;
			this.log.debug('values ' + JSON.stringify(values));
			// Send command for state changes
			if (deviceId[4] === undefined) {
				this.log.debug('Send state');
				values = {
					[deviceId[3]]:state.val
				};
				this.log.debug('values 4 ' + JSON.stringify(values));
				
			} else {

				// Send command 1 - level  nestinng
				if (deviceId[5] === undefined) {
					this.log.debug('Send nested state');

					values = {
						[deviceId[3]] : {
							[deviceId[4]]:state.val
						}};
					this.log.debug('values 5 ' + JSON.stringify(values));
				}

				// // Handle segments	
				if (deviceId[3] === 'seg') {
					this.log.debug('Send seg');
					const valAsNumbers = parseFloat(deviceId[4]);
					this.log.debug('test number : ' + valAsNumbers);
					if (deviceId[5] === 'col'){
						this.log.debug('Send col');
						// const valAsNumbers = state.val.split(',').map(s => parseInt(s));
						const  color_root = deviceId[2] + '.' + deviceId[3] + '.' + deviceId[4] + '.' + deviceId[5];
						this.log.debug(color_root);
						if (deviceId[6] === '0_HEX' || deviceId[6] === '1_HEX' || deviceId[6] === '2_HEX') {

							this.log.debug('HEX color change initiated, convert to RGB and send data');

							try {
								
								const colorPrimaryHex = await  this.getStateAsync(color_root + '.0_HEX');
								if(!colorPrimaryHex)  return;
								const colorSecondaryHex = await  this.getStateAsync(color_root + '.1_HEX');
								if(!colorSecondaryHex)  return;
								const colorTertiaryHex = await  this.getStateAsync(color_root + '.1_HEX');
								if(!colorTertiaryHex)  return;

								const colorPrimaryRGB = hexRgb(colorPrimaryHex.val);
								const colorSecondaryRGB = hexRgb(colorSecondaryHex.val);
								const colorTertiaryRGB = hexRgb(colorTertiaryHex.val);
									
								const rgb_all = [[colorPrimaryRGB.red,colorPrimaryRGB.green,colorPrimaryRGB.blue] , [colorSecondaryRGB.red,colorSecondaryRGB.green,colorSecondaryRGB.blue] , [colorTertiaryRGB.red,colorTertiaryRGB.green,colorTertiaryRGB.blue]];

								this.log.debug('Converted RGB values of HEX input : ' + colorPrimaryRGB + ' : ' + colorSecondaryRGB + ' : ' + colorTertiaryRGB);

								values = {
									'seg': {
										'id': valAsNumbers, 
										'col':rgb_all
									}};
									
							} catch (error) {
								this.log.error('Hex conversion issue : ' + error);
							}

						} else if ((deviceId[6] === '0' || deviceId[6] === '1' || deviceId[6] === '2') ){

							this.log.debug('RGB color change initiated, convert to RGB and send data');

							try {
							
								let color_primary = await  this.getStateAsync(color_root + '.0');
								if(!color_primary)  return;
								this.log.debug('Primmary color before split : ' + color_primary.val);
								try {
									color_primary = color_primary.val.split(',').map(s => parseInt(s));
								} catch (error) {
									if(!color_primary)  return;
									color_primary = color_primary.val;
								}
		
								let color_secondary = await  this.getStateAsync(color_root + '.1');
								if(!color_secondary)  return;
								this.log.debug('Secondary color : ' + color_secondary.val);
								try {
									color_secondary = color_secondary.val.split(',').map(s => parseInt(s));
								} catch (error) {
									if(!color_secondary)  return;
									color_secondary = color_secondary.val;
								}
		
								let color_tertiary = await  this.getStateAsync(color_root + '.2');
								if(!color_tertiary)  return;
								this.log.debug('Tertary color : ' + color_tertiary.val);
								try {
									color_tertiary = color_tertiary.val.split(',').map(s => parseInt(s));
								} catch (error) {
									if(!color_tertiary)  return;
									color_tertiary = color_tertiary.val;
								}
		
								this.log.debug('Color values from states : ' + color_primary + ' : ' + color_secondary + ' : ' + color_tertiary);
								
								const rgb_all = [color_primary , color_secondary , color_tertiary];
															
								values = {
									'seg': {
										'id': valAsNumbers, 
										'col':rgb_all
									}};

										
							} catch (error) {
								this.log.error(error);
							}
						}
					} else {

						values = {
							[deviceId[3]] : {
								id:valAsNumbers,
								[deviceId[5]]:state.val
							}};	


					}
					this.log.debug('values segment ' + JSON.stringify(values));
				}
			}  

			this.log.debug('Prepare API call for device : ' + device + ' and values + ' + values); 			
			let device_ip = await this.getForeignObjectAsync('wled.' + this.instance + '.' + deviceId[2]);
			if (!device_ip) return;	
			device_ip = device_ip.native.ip;

			// Only make API call when values are correct
			if (values !== null && device_ip !== null) {					

				// Send API Post command
				const result = await this.postAPI('http://' +  device_ip + '/json', values);
				if (!result) return;

				this.log.debug('API feedback' + JSON.stringify(result));
				if (result.success === true){
					// Set state aknowledgement if  API call was succesfully
					this.setState(id, {ack : true});
					(function () {if (timeout) {clearTimeout(timeout); timeout = null;}})();
					timeout = setTimeout( () => {
						this.read_data(device_ip);
					}, 50);
					
				}
			}

		} else {
			// The state was deleted
			// 	this.log.info(`state ${id} deleted`);
		}
	}

	async read_data(index){
		this.log.debug('Read data called : ' + JSON.stringify(index));
		// Handle object arrays from WLED API
		/** @type {Record<string, any>[]} */
		// const objArray = JSON.parse(body);

		// Error handling needed!
		try {
			const objArray = await this.getAPI('http://' + index + '/json');
			if(!objArray) {
				this.log.warn('API call error, will retry in shedule interval !');
				return;
			} else {
				this.log.debug('Data received from WLED device ' + JSON.stringify(objArray));
			}

			try {
				const device_id = objArray['info'].mac;	
				// Create Device, channel id by MAC-Adress and ensure relevant information for polling and instance configuration is part of device object
				await this.extendObjectAsync(device_id, {
					type: 'device',
					common: {
						name : objArray['info'].name
					},
					native: { 
						ip : index,
						mac : objArray['info'].mac,
						name : objArray['info'].name
					}
				});

				// Update adapter workig state, set connection state to true if at least  1 device is connected
				await this.create_state('info.connection', 'connection', true);

				// Update device workig state
				await this.create_state(device_id + '._info' + '._online', 'online', true);
				
				// build effects array

				for (const i in objArray.effects) {

					this.effects[i] = objArray.effects[i];
				}

				for (const i in objArray.palettes) {

					this.palettes[i] = objArray.palettes[i];
				}

				// Read info Channel
				for (const i in objArray['info']){

					this.log.debug('Datatype : ' + typeof(objArray['info'][i]));

					// Create Info channel
					await this.setObjectNotExistsAsync(device_id + '._info', {
						type: 'channel',
						common: {
							name: 'Basic information',
						},
						native: {},
					});

					// Create Chanels for led and  wifi configuration
					switch (i) {
						case ('leds'):
							this.setObjectNotExistsAsync(device_id + '._info.leds', {
								type: 'channel',
								common: {
									name: 'LED stripe configuration	',
								},
								native: {},
							});
							
							break;

						case ('wifi'):
							this.setObjectNotExistsAsync(device_id + '._info.wifi', {
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
					if (typeof(objArray['info'][i]) !== 'object'){

						// Default channel creation
						this.log.debug('State created : ' +i + ' : ' + JSON.stringify(objArray['info'][i]));
						this.create_state(device_id + '._info.' + i ,i,objArray['info'][i],true);

					} else {
						for (const y in objArray['info'][i]){
							this.log.debug('State created : ' + y + ' : ' + JSON.stringify(objArray['info'][i][y]));
							this.create_state(device_id + '._info.' + i + '.' + y,y,objArray['info'][i][y],true);
						}
					}

				}
				
				// Read state Channel
				for (const i in objArray['state']){

					this.log.debug('Datatype : ' + typeof(objArray['state'][i]));

					// Create Chanels for led and  wifi configuration
					switch (i) {
						case ('ccnf'):
							this.setObjectNotExistsAsync(device_id + '.ccnf', {
								type: 'channel',
								common: {
									name: 'ccnf',
								},
								native: {},
							});
							
							break;

						case ('nl'):
							this.setObjectNotExistsAsync(device_id + '.nl', {
								type: 'channel',
								common: {
									name: 'Nightlight',
								},
								native: {},
							});
							
							break;

						case ('udpn'):
							this.setObjectNotExistsAsync(device_id + '.udpn', {
								type: 'channel',
								common: {
									name: 'Broadcast (UDP sync)',
								},
								native: {},
							});
							
							break;

						case ('seg'):

							this.log.debug('Segment Array : ' + JSON.stringify(objArray['state'][i]));

							this.setObjectNotExistsAsync(device_id + '.seg', {
								type: 'channel',
								common: {
									name: 'Segmentation',
								},
								native: {},
							});

							for (const y in objArray['state'][i]){

								this.setObjectNotExistsAsync(device_id + '.seg.' + y, {
									type: 'channel',
									common: {
										name: 'Segment ' + y,
									},
									native: {},
								});

								for (const x in objArray['state'][i][y]){
									this.log.debug('Object states created for channel ' + i + ' with parameter : ' + y + ' : ' + JSON.stringify(objArray['state'][i][y]));

									if ( x !== 'col'){

										this.create_state(device_id + '.' + i + '.' + y + '.' + x , x,objArray['state'][i][y][x],true);

									} else {
										this.log.debug('Naming  : ' + x + ' with content : ' + JSON.stringify(objArray['state'][i][y][x][0]));
										let primaryHex = objArray['state'][i][y][x][0].toString().split(',');
										primaryHex = rgbHex(parseInt(primaryHex[0]),parseInt(primaryHex[1]),parseInt(primaryHex[2]));
										let secondaryHex = objArray['state'][i][y][x][1].toString().split(',');
										secondaryHex = rgbHex(parseInt(secondaryHex[0]),parseInt(secondaryHex[1]),parseInt(secondaryHex[2]));
										let tertiaryHex = objArray['state'][i][y][x][2].toString().split(',');
										tertiaryHex = rgbHex(parseInt(tertiaryHex[0]),parseInt(tertiaryHex[1]),parseInt(tertiaryHex[2]));
										
										this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.0', 'Primary Color RGB',objArray['state'][i][y][x][0],true);
										this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.0_HEX', 'Primary Color HEX','#' + primaryHex,true);		
										this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.1', 'Secondary Color RGB (background)',objArray['state'][i][y][x][1],true);
										this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.1_HEX', 'Secondary Color HEX (background)','#' + secondaryHex,true);
										this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.2', 'Tertiary Color RGB',objArray['state'][i][y][x][2],true);
										this.create_state(device_id + '.' + i + '.' + y + '.' + x + '.2_HEX', 'Tertiary Color HEX','#' + tertiaryHex,true);
									}
								}
							}
							
							break;

						default:
							
					}

					// Create states, ensure object structures are reflected in tree
					if (typeof(objArray['state'][i]) !== 'object'){

						// Default channel creation
						this.log.debug('Default state created : ' +i + ' : ' + JSON.stringify(objArray['state'][i]));
						this.create_state(device_id + '.' + i ,i,objArray['state'][i],true);

					} else {
						
						for (const y in objArray['state'][i]){
							if (typeof(objArray['state'][i][y]) !== 'object'){
								this.log.debug('Object states created for channel ' + i + ' with parameter : ' + y + ' : ' + JSON.stringify(objArray['state'][i][y]));
								this.create_state(device_id + '.' + i + '.' + y,y,objArray['state'][i][y],true);
							}
						}
					}
				}

				// Create additional  states not included in JSON-API of WLED
				this.create_state(device_id + '.tt','tt',null,true);
				this.create_state(device_id + '.psave','psave',null,true);
				this.create_state(device_id + '.udpn.nn','nn',null,true);
				this.create_state(device_id + '.time','time',null,true);

			} catch (error) {
				
				// Set alive state to false if device is not reachable
				this.setState(this.devices[index] + '._info' + '._online', {val : false, ack : true});
				this.log.error('Read Data error : ' + error);
				this.log.error ('Debug information for developer : ' + JSON.stringify(objArray));
			
			}

		} catch (error) {
			this.log.error('API call failed : ' + error);
			return;
		}
		
	}

	async polling_timer(){

		this.log.debug('polling timer for  devices : ' + JSON.stringify(this.devices));

		// Loop true device array and start data polling
		for (const i in this.devices) {
			// ( ()  => {if (polling[this.devices[i]]) {clearTimeout(polling[this.devices[i]]); polling[this.devices[i]] = null;}})();
	
			this.read_data(i);
			this.log.debug('Getting data for ' + this.devices[i]);
			
		}

		// Reset timer (if running) and start new one for next polling intervall
		( ()  => {if (polling) {clearTimeout(polling); polling = null;}})();
		polling = setTimeout( () => {
			this.polling_timer();
		}, (this.config.Time_Sync * 1000));
		
	}

	async getAPI(url) {

		try {
			const response = await axios.get(url);
			this.log.debug(JSON.stringify('API response data : ' + response.data));
			return response.data;
		} catch (error) {
			// this.log.error(error);
		}
	}

	async postAPI(url, values) {
		this.log.debug('Post API called for : ' + url + ' and  values : ' + JSON.stringify(values));
		try {
			// this.log.info('Post sent')

			const result = axios.post(url, values)
				.then( (response) => {
					return response.data;
				})
				.catch( (error) => {
					this.log.error('Sending command to WLED device + ' + url + ' failed with error ' + error);
					return error;
				});	
			return result;
		} catch (error) {
			this.log.error(error);
		}
	}
	
	// Scan network  with Bonjour service and build array for data-polling
	async scan_devices(){
		// browse for all wled devices
		this.log.debug('Sending Bonjour broadcast for device discovery');
		await bonjour.find({'type': 'wled'}, (service) => {
		
			const id = service.txt.mac;
			const ip = service.referer.address;

			// Check if device is already know
			if (this.devices[ip] === undefined) {
				this.log.info('Device ' + service.name + ' found on IP ' + service.referer.address);

				//  Add device to polling array
				// this.devices[id] = ip;
				this.devices[ip] = id;

				this.log.info('Devices array from bonjour scan : ' + JSON.stringify(this.devices));
				// this.log.info('Devices array from bonjour scan : ' + JSON.stringify(this.devices_test));

				// Send signal to admin for refresh configuration page
				// To-Do

				// Initialize device
				this.polling_timer();
			} else {
				// Update memory with current ip address
				this.devices[ip] = id;
			}

			this.log.debug('Devices array from bonjour scan : ' + JSON.stringify(this.devices));
		});

		// Rerun scan every minute
		(function () {if (scan_timer) {clearTimeout(scan_timer); scan_timer = null;}})();
		scan_timer = setTimeout( () => {
			this.scan_devices();

			// intervall should be configurable
		}, (this.config.Time_Scan * 1000));
 
	}

	async create_state(state, name, value, expire){
		this.log.debug('Create_state called for : ' + state + ' with value : ' + value);

		try {

			// Try to get details from state lib, if not use defaults. throw warning is states is not known in attribute list
			if((stateAttr[name] === undefined)){this.log.warn('State attribute definition missing for + ' + name);}
			const writable = (stateAttr[name] !== undefined) ?  stateAttr[name].write || false : false;
			const state_name = (stateAttr[name] !== undefined) ?  stateAttr[name].name || name : name;
			const role = (stateAttr[name] !== undefined) ?  stateAttr[name].role || 'state' : 'state';
			const type = (stateAttr[name] !== undefined) ?  stateAttr[name].type || 'mixed' : 'mixed';
			const unit = (stateAttr[name] !== undefined) ?  stateAttr[name].unit || '' : '';
			this.log.debug('Write value : ' + writable);

			await this.setObjectNotExistsAsync(state, {
				type: 'state',
				common: {
					name: state_name,
					role: role,
					type: type,
					unit: unit,
					write : writable
				},
				native: {},
			});

			await this.setState(state, {val: value, ack: true, expire: ((this.config.Time_Sync * 1000 ) * 2)});

			if (name === 'fx') {

				this.log.debug('Create special drop donwn state with value ' + JSON.stringify(this.effects));

				await this.extendObjectAsync(state, {
					type: 'state',
					common: {
						states : this.effects
					}
				});

			} else if (name === 'pal') {

				this.log.debug('Create special drop donwn state with value ' + JSON.stringify(this.effects));

				await this.extendObjectAsync(state, {
					type: 'state',
					common: {
						states : this.palettes
					}
				});

			}

			// Subscribe on state changes if writable
			if (writable === true) {this.subscribeStates(state);}

		} catch (error) {
			this.log.error('Create state error = ' + error);
		}
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
