const fs = require('fs');

if(process.argv.length != 3) {
	console.log('Usage: node index.js <input.sobj>');
	return;
}

let payloadbuf = fs.readFileSync(process.argv[2]);

bootPayload = [...payloadbuf];

globalVariables = {};

class Context {
	constructor(global, payload, registers, variables) {
		this.global = global;
		this.payload = payload;
		this.registers = registers || [];
		if(registers == null) {
			for(let i = 0; i < 126; i++) {
				this.registers[i] = undefined;
			}
			this.registers[123] = undefined;
			this.registers[124] = [{h: 0, t: global}];
			this.registers[125] = 0;
		}
		this.variables = variables || {};
	}
}
global.Context = Context;

let globalContext = new Context(global, bootPayload, null, globalVariables);

function decode(ctx) {
	let depth = 0;
	let reg = 125;
	while(depth++ < 127 && reg & 0b10000000) {
		reg = ctx.registers[reg & 0b01111111];
	}
	if(reg & 0b10000000) {
		throw "Circular pointer";
	}
	if(reg > 125 && reg < 128) {
		throw "Unexpected constant";
	}
	let r = Math.round(ctx.registers[reg]);
	ctx.registers[reg] = r + 1;
	if(r >= ctx.payload.length || r < 0) {
		return -1;
	}
	return ctx.payload[r];
}

function readArg(ctx) {
	let b = decode(ctx);
	let depth = 0;
	while(depth++ < 127 && b & 0b10000000) {
		b = ctx.registers[b & 0b01111111];
	}
	if(b & 0b10000000) {
		throw "Circular register pointer";
	}
	if(b === 127) {
		let buf = new ArrayBuffer(8);
		let u8 = new Uint8Array(buf);
		u8[7] = decode(ctx);
		u8[6] = decode(ctx);
		u8[5] = decode(ctx);
		u8[4] = decode(ctx);
		u8[3] = decode(ctx);
		u8[2] = decode(ctx);
		u8[1] = decode(ctx);
		u8[0] = decode(ctx);
		let f64 = new Float64Array(buf);
		return f64[0];
	}else if(b === 126) {
		let strc = [];
		let i;
		while((i = decode(ctx)) != 0) {
			strc.push(String.fromCharCode(i));
		}
		return strc.join('');
	}
	return ctx.registers[b];
}

let instructionCount = 0;

function readInstruction(ctx) {
	instructionCount++;
	let r = decode(ctx);
	if(r < 0) return null;
	if(r >= instructions.length) throw "Invalid instruction, ISN# " + instructionCount;
	return instructions[r];
}

function writeArg(ctx, value) {
	let b = decode(ctx);
	let depth = 0;
	while(depth++ < 127 && b & 0b10000000) {
		b = ctx.registers[b & 0b01111111];
	}
	if(b & 0b10000000) {
		throw "Circular pointer";
	}
	if(b > 125) {
		throw "Unexpected constant";
	}
	ctx.registers[b] = value;
	return b;
}

let instructions = [
	//arithmatic
	//add
	function(ctx) {
		writeArg(ctx, readArg(ctx) + readArg(ctx));
	},
	//sub
	function(ctx) {
		writeArg(ctx, readArg(ctx) - readArg(ctx));
	},
	//mul
	function(ctx) {
		writeArg(ctx, readArg(ctx) * readArg(ctx));
	},
	//div
	function(ctx) {
		writeArg(ctx, readArg(ctx) / readArg(ctx));
	},
	//mod
	function(ctx) {
		writeArg(ctx, readArg(ctx) % readArg(ctx));
	},

	//boolean arithmatic
	//or
	function(ctx) {
		writeArg(ctx, readArg(ctx) || readArg(ctx));
	},
	//and
	function(ctx) {
		writeArg(ctx, readArg(ctx) && readArg(ctx));
	},
	//not
	function(ctx) {
		writeArg(ctx, !readArg(ctx));
	},

	//bit arithmatic
	//shr
	function(ctx) {
		writeArg(ctx, readArg(ctx) >> readArg(ctx));
	},
	//shl
	function(ctx) {
		writeArg(ctx, readArg(ctx) << readArg(ctx));
	},
	//shrz
	function(ctx) {
		writeArg(ctx, readArg(ctx) >>> readArg(ctx));
	},
	//bit_or
	function(ctx) {
		writeArg(ctx, readArg(ctx) | readArg(ctx));
	},
	//bit_and
	function(ctx) {
		writeArg(ctx, readArg(ctx) & readArg(ctx));
	},
	//bit_xor
	function(ctx) {
		writeArg(ctx, readArg(ctx) ^ readArg(ctx));
	},
	//bit_not
	function(ctx) {
		writeArg(ctx, ~readArg(ctx));
	},

	//register management
	//mov
	function(ctx) {
		writeArg(ctx, readArg(ctx));
	},
	//xchg
	function(ctx) {
		let r1 = readRegister(ctx);
		let r2 = readRegister(ctx);
		let v1 = registers[r1];
		registers[r1] = registers[r2];
		registers[r2] = v1;
	},

	//JS interface
	//global
	function(ctx) {
		writeArg(ctx, ctx.global);
	},
	//getprop
	function(ctx) {
		writeArg(ctx, readArg(ctx)[readArg(ctx)]);
	},
	//setprop
	function(ctx) {
		readArg(ctx)[readArg(ctx)] = readArg(ctx);
	},
	//in
	function(ctx) {
		writeArg(ctx, readArg(ctx) in readArg(ctx));
	},
	//delete
	function(ctx) {
		delete readArg(ctx)[readArg(ctx)];
	},
	//instanceof
	function(ctx) {
		writeArg(ctx, readArg(ctx) instanceof readArg(ctx));
	},
	//typeof
	function(ctx) {
		writeArg(ctx, typeof readArg(ctx));
	},
	//call_0
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, []));
	},
	//call_1
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx)]));
	},
	//call_2
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx), readArg(ctx)]));
	},
	//call_3
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx), readArg(ctx), readArg(ctx)]));
	},
	//call_4
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx)]));
	},
	//call_5
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx)]));
	},
	//call_6
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx)]));
	},
	//call_7
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx)]));
	},
	//call_8
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx)]));
	},
	//call_9
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx)]));
	},
	//call_10
	function(ctx) {
		let th = readArg(ctx);
		writeArg(ctx, readArg(ctx).apply(th, [readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx), readArg(ctx)]));
	},
	//obj
	function(ctx) {
		writeArg(ctx, {});
	},
	//arr
	function(ctx) {
		writeArg(ctx, []);
	},
	//null
	function(ctx) {
		writeArg(ctx, null);
	},
	//undefined
	function(ctx) {
		writeArg(ctx, undefined);
	},
	//regex
	function(ctx) {
		writeArg(ctx, new RegExp(readArg(ctx), readArg(ctx)));
	},
	// true
	function(ctx) {
		writeArg(ctx, true);
	},
	// false
	function(ctx) {
		writeArg(ctx, false);
	},
	// protokeys
	function(ctx) {
		let obj = readArg(ctx);
		let ret = [];
		for(let x in obj) {
			ret.push(x);
		}
		writeArg(ctx, ret);
	},

	//comparison
	//eq
	function(ctx) {
		let a1 = readArg(ctx);
		let a2 = readArg(ctx);
		writeArg(ctx, a1 == a2 || ((a1 == undefined || a2 == undefined) && (a1 == 0 || a2 == 0)));
	},
	//eq_typed
	function(ctx) {
		writeArg(ctx, readArg(ctx) === readArg(ctx));
	},
	//neq
	function(ctx) {
		let a1 = readArg(ctx);
		let a2 = readArg(ctx);
		writeArg(ctx, a1 != a2 && !((a1 == undefined || a2 == undefined) && (a1 == 0 || a2 == 0)));
	},
	//neq_typed
	function(ctx) {
		writeArg(ctx, readArg(ctx) !== readArg(ctx));
	},
	//le
	function(ctx) {
		writeArg(ctx, readArg(ctx) < readArg(ctx));
	},
	//gr
	function(ctx) {
		writeArg(ctx, readArg(ctx) > readArg(ctx));
	},
	//leeq
	function(ctx) {
		writeArg(ctx, readArg(ctx) <= readArg(ctx));
	},
	//greq
	function(ctx) {
		writeArg(ctx, readArg(ctx) >= readArg(ctx));
	},

	//branching
	//jmp
	function(ctx) {
		ctx.registers[125] = readArg(ctx);
	},
	//jz
	function(ctx) {
		let a = readArg(ctx);
		if(a == 0 || a == undefined) {
			ctx.registers[125] = readArg(ctx);
		}else{
			readArg(ctx);
		}
	},
	//jnz
	function(ctx) {
		let a = readArg(ctx);
		if(a != 0 && a != undefined) {
			ctx.registers[125] = readArg(ctx);
		}else{
			readArg(ctx);
		}
	},

	//variables
	//setvar
	function(ctx) {
		ctx.variables[readArg(ctx)] = readArg(ctx);
	},
	//getvar
	function(ctx) {
		writeArg(ctx, ctx.variables[readArg(ctx)]);
	},

	//VM interface
	//context
	function(ctx) {
		writeArg(ctx, ctx);
	},

	//debugging
	//report
	function(ctx) {
		console.log('reported:', readArg(ctx));
	},
	//dump
	function(ctx) {
		for(let i = 0; i < ctx.registers.length; i++) {
			console.log(i + ':', readArg(ctx));
		}
	},
]

function runContext(ctx) {
	let ins = null;
	while((ins = readInstruction(ctx)) != null) {
		ins(ctx);
	}
}
global.runContext = runContext;

runContext(globalContext);