// Classification of all state attributes possible
const state_attrb = {
	// State object
	'on': {
		name: 'On / Off',
		role: 'switch',
		write: true,
	},
	'bri': {
		name: 'Brightness of the light',
		role: 'value.brightness',
		write: true,
	},
	'transition': {
		name: 'Duration of the crossfade between different colors/brightness levels.',
		role: 'value.transition',
		write: true,
	},
	'ps': {
		name: 'ID of currently set preset',
		write: true,
	},
	'pl': {
		name: 'ID of currently set playlist',
		write: true,
	},
	'dur': {
		name: 'Duration of nightlight in minutes',
		write: true,
	},
	'fade': {
		name: 'Gradually dim over the course of the nightlight duration',
		write: true,
	},
	'tbri': {
		name: 'Target brightness of nightlight feature',
		role: 'value.brightness',
		write: true,
	},
	'send': {
		name: 'Send WLED broadcast (UDP sync) packet on state change',
		role: 'switch',
		write: true,
	},
	'recv': {
		name: 'Receive broadcast packets',
		role: 'switch',
		write: true,
	},
	'mainseg': {
		name: 'Main Segment',
		write: true,
	},
	'pss': {
		// To be added
	},

	// State not included in  JSON response
	'tt': {
		name: 'Similar to transition, but applies to just the current API call.',
		type: 'number',
		write: true,
	},
	'psave': {
		name: 'Save current light config to specified preset slot',
		type: 'number',
		write: true,
	},
	'nn': {
		name: 'Dont send a broadcast packet (applies to just the current API call)',
		type: 'boolean',
		write: true,
	},

	//   segment object
	'id': {
		name: 'Zero-indexed ID of the segment',
		// write: true,
	},
	'start': {
		name: 'LED the segment starts at.',
		write: true,
	},
	'stop': {
		name: 'LED the segment stops at, not included in range',
		write: true,
	},
	'len': {
		name: 'Length of the segment (stop - start). stop has preference',
		write: true,
	},
	'fx': {
		name: 'ID of the effect ',
		write: true,
	},
	'sx': {
		name: 'Relative effect speed',
		write: true,
	},
	'ix': {
		name: 'Effect intensity',
		write: true,
	},
	'pal': {
		name: 'ID of the color palette',
		write: true,
	},
	'sel': {
		name: 'Selected segments will have their state (color/FX) updated ',
		type: 'boolean',
		role: 'switch',
		write: true,
	},
	'rev': {
		name: 'Flips the segment, causing animations to change direction',
		type: 'boolean',
		role: 'switch',
		write: true,
	},
	'cln': {
		name: 'Clones the segment with the given id, exactly mirroring its LED contents',
		write: true,
	},
	'Primary Color RGB': {
		name: 'Primary Color RGB',
		type: 'mixed',
		role: 'level.color.rgb',
		write: true,
	},
	'Secondary Color RGB (background)': {
		name: 'Secondary Color RGB (background)',
		type: 'mixed',
		role: 'level.color.rgb',
		write: true,
	},
	'Tertiary Color RGB': {
		name: 'Tertiary Color RGB',
		type: 'mixed',
		role: 'level.color.rgb',
		write: true,
	},
	'Primary Color HEX': {
		name: 'Primary Color HEX',
		type: 'mixed',
		role: 'level.color.hex',
		write: true,
	},
	'Secondary Color HEX (background)': {
		name: 'Secondary Color HEX (background)',
		type: 'mixed',
		role: 'level.color.hex',
		write: true,
	},
	'Tertiary Color HEX': {
		name: 'Tertiary Color HEX',
		type: 'mixed',
		role: 'level.color.hex',
		write: true,
	},
	'spc': {
		// To be added
	},
	'grp': {
		// To be added
	},

	// Info object (all read only !)
	'connection': {
		name: 'Adapter working state',
		type: 'boolean',
		role: 'indicator.connected',
	},
	'online': {
		name: 'Device connection state',
		type: 'boolean',
		role: 'indicator.connected',
	},
	'ver': {
		name: 'Version name',
	},
	'vid': {
		name: 'Build ID (YYMMDDB, B = daily build index',
	},
	'count': {
		name: 'Total LED count',
		role: 'value',
	},
	'rgbw': {
		name: 'true if LEDs are 4-channel (RGBW)',
		type: 'boolean',
	},
	'pin': {
		name: 'LED strip pin(s). In 0.8.4, always one element',
		type: 'mixed',
	},
	'pwr': {
		name: 'Current LED power usage in milliamps as determined by the ABL. 0 if ABL is disabled',
		role: 'value.power',
		unit: 'mA'
	},
	'maxpwr': {
		name: 'Maximum power budget in milliamps for the ABL. 0 if ABL is disabled',
		role: 'value.power',
		unit: 'mA'
	},
	'maxseg': {
		name: 'Maximum number of segments supported by this version',
	},
	'name': {
		name: 'Friendly name of the light. Intended for display in lists and titles',
		type: 'mixed',
		role: 'info.name',
	},
	'udpport': {
		name: 'The UDP port for realtime packets and WLED broadcast',
		role: 'info.port',
	},
	'live': {
		name: 'If true, the software is currently receiving realtime data via UDP or E1.31',
		type: 'boolean',
	},
	'fxcount': {
		name: 'Number of effects included',
		type: 'mixed',
		role: 'info.name',
	},
	'palcount': {
		name: 'Number of palettes configured',
		type: 'mixed',
		role: 'info.name',
	},
	'bssid': {
		name: 'The BSSID of the currently connected network',
		type: 'mixed',
		role: 'info.address',
	},
	'signal': {
		name: 'Relative signal quality of the current connection',
		role: 'info.status',
	},
	'channel': {
		name: 'The current WiFi channel',
		role: 'info.address',
	},

	'arch': {
		name: 'Name of the platform.',
		type: 'mixed',
	},
	'core': {
		name: 'Version of the underlying (Arduino core) SDK',
		type: 'mixed',
	},
	'freeheap': {
		name: 'Bytes of heap memory (RAM) currently available. Problematic if <10k.',
		role: 'info.status',
	},
	'uptime': {
		name: 'Time since the last boot/reset in seconds',
		role: 'info.status',
	},
	'opt': {
		name: 'Used for debugging purposes only',
		type: 'mixed',
	},
	'brand': {
		name: 'The producer/vendor of the light. Always WLED for standard installations.',
		type: 'mixed',
		role: 'info.name    ',
	},
	'product': {
		name: 'The product name. Always DIY light for standard installations.',
		type: 'mixed',
		role: 'info.name',
	},
	'btype': {
		name: 'The origin of the build',
		type: 'mixed',
	},
	'mac': {
		name: 'The hexadecimal hardware MAC address of the light, lowercase and without colons',
		type: 'string',
		role: 'info.mac',
	},
	'u': {
		name: 'fsBytesUsed in kB',
		unit: 'kB',
	},
	't': {
		name: 'fsBytesTotal in kB',
		unit: 'kB',
	},
	'pmt': {
		name: 'presetsModifiedTime',
	},
	'rem': {
		name: 'Remaining nightlight in seconds',
		unit: 's',
	},
	'lwip': {
		// To be added
	},
	'rssi': {
		// To be added
	},
	'str': {
		// To be added
	},
	'segblock': {
		// To be added
	},
	'wv': {
		// To be added
	},
	'max': {
		// To be added
	},
	'min': {
		// To be added
	},
	'time': {
		name: 'Set module time to unix timestamp.',
		role: 'info.date',
	},
	'seglock': {
		// To be added
	},
	'lor': {
		name: 'Live data override. 0 is off, 1 is override until live data ends, 2 is override until ESP reboot (available since 0.10.0)',
		type: 'number',
	},
	'lip': {
		// To be added
	},
	'lm': {
		// To be added
	},
	'ws': {
		name: 'Number of currently connected WebSockets clients. -1 indicates that WS is unsupported in this build.',
	},
	'mode': {
		name: 'Nightlight mode',
	},
	'mi': {
		name: 'Mirrors the segment (available since 0.10.2)',
	},
};

module.exports = state_attrb;