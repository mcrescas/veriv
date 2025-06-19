import {
	DataTextureLoader,
	DataUtils,
	FloatType,
	HalfFloatType,
	LinearSRGBColorSpace,
	LinearFilter,
	RedFormat,
	RGFormat,
	RGBFormat,
	RGBAFormat,
	ClampToEdgeWrapping,
	DataTexture,
	FileLoader,
	TextureDataType,
} from 'three';

// @ts-ignore
import * as fflate from './ext/fflate.module.js';

// Referred to the original Industrial Light & Magic OpenEXR implementation and the TinyEXR / Syoyo Fujita
// implementation, so I have preserved their copyright notices.

// /*
// Copyright (c) 2014 - 2017, Syoyo Fujita
// All rights reserved.

// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//     * Redistributions of source code must retain the above copyright
//       notice, this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//     * Neither the name of the Syoyo Fujita nor the
//       names of its contributors may be used to endorse or promote products
//       derived from this software without specific prior written permission.

// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL <COPYRIGHT HOLDER> BE LIABLE FOR ANY
// DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
// ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
// */

// // TinyEXR contains some OpenEXR code, which is licensed under ------------

// ///////////////////////////////////////////////////////////////////////////
// //
// // Copyright (c) 2002, Industrial Light & Magic, a division of Lucas
// // Digital Ltd. LLC
// //
// // All rights reserved.
// //
// // Redistribution and use in source and binary forms, with or without
// // modification, are permitted provided that the following conditions are
// // met:
// // *       Redistributions of source code must retain the above copyright
// // notice, this list of conditions and the following disclaimer.
// // *       Redistributions in binary form must reproduce the above
// // copyright notice, this list of conditions and the following disclaimer
// // in the documentation and/or other materials provided with the
// // distribution.
// // *       Neither the name of Industrial Light & Magic nor the names of
// // its contributors may be used to endorse or promote products derived
// // from this software without specific prior written permission.
// //
// // THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
// // "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
// // LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
// // A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
// // OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
// // SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
// // LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// // DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// // THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// // (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
// // OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
// //
// ///////////////////////////////////////////////////////////////////////////

// // End of OpenEXR license -------------------------------------------------


interface EXRDecoder {
	size: number;
	viewer: DataView;
	array: Uint8Array;
	offset: any;
	width: number;
	height: number;
	channels: number;
	bytesPerLine: any;
	lines: number;
	inputSize: any;
	type: number;
	uncompress: any;
	getter: any;
	format: any;
	encoding: any;

	scanlineBlockSize: number;
	blockCount: number;
	outputChannels: number;
	byteArray: Float32Array | Uint16Array;
}

interface EXRHeader {
	version : number;
	spec: any;
	[key: string]: any; // Allow indexing with string keys
}

interface ImgChannel {
	name: string;
	length: number;
	data: Float32Array | Uint16Array;
}

class EXRLoader extends DataTextureLoader {

	type : TextureDataType;

	constructor( manager = undefined ) {

		super( manager );

		this.type = HalfFloatType;

	}

	parse( buffer: ArrayBuffer ) {

		const USHORT_RANGE = ( 1 << 16 );
		const BITMAP_SIZE = ( USHORT_RANGE >> 3 );

		const HUF_ENCBITS = 16; // literal (value) bit length
		const HUF_DECBITS = 14; // decoding bit size (>= 8)

		const HUF_ENCSIZE = ( 1 << HUF_ENCBITS ) + 1; // encoding table size
		const HUF_DECSIZE = 1 << HUF_DECBITS; // decoding table size
		const HUF_DECMASK = HUF_DECSIZE - 1;

		const NBITS = 16;
		const A_OFFSET = 1 << ( NBITS - 1 );
		const MOD_MASK = ( 1 << NBITS ) - 1;

		const SHORT_ZEROCODE_RUN = 59;
		const LONG_ZEROCODE_RUN = 63;
		const SHORTEST_LONG_RUN = 2 + LONG_ZEROCODE_RUN - SHORT_ZEROCODE_RUN;

		const ULONG_SIZE = 8;
		const FLOAT32_SIZE = 4;
		const INT32_SIZE = 4;
		const INT16_SIZE = 2;
		const INT8_SIZE = 1;

		const STATIC_HUFFMAN = 0;
		const DEFLATE = 1;

		const UNKNOWN = 0;
		const LOSSY_DCT = 1;
		const RLE = 2;

		const logBase = Math.pow( 2.7182818, 2.2 );

		function reverseLutFromBitmap( bitmap: any, lut: any ) {

			let k = 0;

			for ( let i = 0; i < USHORT_RANGE; ++ i ) {

				if ( ( i == 0 ) || ( bitmap[ i >> 3 ] & ( 1 << ( i & 7 ) ) ) ) {

					lut[ k ++ ] = i;

				}

			}

			const n = k - 1;

			while ( k < USHORT_RANGE ) lut[ k ++ ] = 0;

			return n;

		}

		function hufClearDecTable( hdec: any ) {

			for ( let i = 0; i < HUF_DECSIZE; i ++ ) {

				hdec[ i ] = {};
				hdec[ i ].len = 0;
				hdec[ i ].lit = 0;
				hdec[ i ].p = null;

			}

		}

		const getBitsReturn = { l: 0, c: 0, lc: 0 };

		function getBits( nBits: any, c: any, lc: any, uInt8Array: any, inOffset: any ) {

			while ( lc < nBits ) {

				c = ( c << 8 ) | parseUint8Array( uInt8Array, inOffset );
				lc += 8;

			}

			lc -= nBits;

			getBitsReturn.l = ( c >> lc ) & ( ( 1 << nBits ) - 1 );
			getBitsReturn.c = c;
			getBitsReturn.lc = lc;

		}

		const hufTableBuffer = new Array( 59 );

		function hufCanonicalCodeTable( hcode: any ) {

			for ( let i = 0; i <= 58; ++ i ) hufTableBuffer[ i ] = 0;
			for ( let i = 0; i < HUF_ENCSIZE; ++ i ) hufTableBuffer[ hcode[ i ] ] += 1;

			let c = 0;

			for ( let i = 58; i > 0; -- i ) {

				const nc = ( ( c + hufTableBuffer[ i ] ) >> 1 );
				hufTableBuffer[ i ] = c;
				c = nc;

			}

			for ( let i = 0; i < HUF_ENCSIZE; ++ i ) {

				const l = hcode[ i ];
				if ( l > 0 ) hcode[ i ] = l | ( hufTableBuffer[ l ] ++ << 6 );

			}

		}

		function hufUnpackEncTable( uInt8Array: any, inDataView: any, inOffset: any, ni: any, im: any, iM: any, hcode: any ) {

			const p = inOffset;
			let c = 0;
			let lc = 0;

			for ( ; im <= iM; im ++ ) {

				if ( p.value - inOffset.value > ni ) return false;

				getBits( 6, c, lc, uInt8Array, p );

				const l = getBitsReturn.l;
				c = getBitsReturn.c;
				lc = getBitsReturn.lc;

				hcode[ im ] = l;

				if ( l == LONG_ZEROCODE_RUN ) {

					if ( p.value - inOffset.value > ni ) {

						throw 'Something wrong with hufUnpackEncTable';

					}

					getBits( 8, c, lc, uInt8Array, p );

					let zerun = getBitsReturn.l + SHORTEST_LONG_RUN;
					c = getBitsReturn.c;
					lc = getBitsReturn.lc;

					if ( im + zerun > iM + 1 ) {

						throw 'Something wrong with hufUnpackEncTable';

					}

					while ( zerun -- ) hcode[ im ++ ] = 0;

					im --;

				} else if ( l >= SHORT_ZEROCODE_RUN ) {

					let zerun = l - SHORT_ZEROCODE_RUN + 2;

					if ( im + zerun > iM + 1 ) {

						throw 'Something wrong with hufUnpackEncTable';

					}

					while ( zerun -- ) hcode[ im ++ ] = 0;

					im --;

				}

			}

			hufCanonicalCodeTable( hcode );

		}

		function hufLength( code: any ) {

			return code & 63;

		}

		function hufCode( code: any ) {

			return code >> 6;

		}

		function hufBuildDecTable( hcode: any, im: any, iM: any, hdecod: any ) {

			for ( ; im <= iM; im ++ ) {

				const c = hufCode( hcode[ im ] );
				const l = hufLength( hcode[ im ] );

				if ( c >> l ) {

					throw 'Invalid table entry';

				}

				if ( l > HUF_DECBITS ) {

					const pl = hdecod[ ( c >> ( l - HUF_DECBITS ) ) ];

					if ( pl.len ) {

						throw 'Invalid table entry';

					}

					pl.lit ++;

					if ( pl.p ) {

						const p = pl.p;
						pl.p = new Array( pl.lit );

						for ( let i = 0; i < pl.lit - 1; ++ i ) {

							pl.p[ i ] = p[ i ];

						}

					} else {

						pl.p = new Array( 1 );

					}

					pl.p[ pl.lit - 1 ] = im;

				} else if ( l ) {

					let plOffset = 0;

					for ( let i = 1 << ( HUF_DECBITS - l ); i > 0; i -- ) {

						const pl = hdecod[ ( c << ( HUF_DECBITS - l ) ) + plOffset ];

						if ( pl.len || pl.p ) {

							throw 'Invalid table entry';

						}

						pl.len = l;
						pl.lit = im;

						plOffset ++;

					}

				}

			}

			return true;

		}

		const getCharReturn = { c: 0, lc: 0 };

		function getChar( c: any, lc: any, uInt8Array: any, inOffset: any ) {

			c = ( c << 8 ) | parseUint8Array( uInt8Array, inOffset );
			lc += 8;

			getCharReturn.c = c;
			getCharReturn.lc = lc;

		}

		const getCodeReturn = { c: 0, lc: 0 };

		function getCode( po: any, rlc: any, c: any, lc: any, uInt8Array: any, inDataView: any, inOffset: any, outBuffer: any, outBufferOffset: any, outBufferEndOffset: any ) {

			if ( po == rlc ) {

				if ( lc < 8 ) {

					getChar( c, lc, uInt8Array, inOffset );
					c = getCharReturn.c;
					lc = getCharReturn.lc;

				}

				lc -= 8;

				let cs = ( c >> lc );
				cs = new Uint8Array( [ cs ] )[ 0 ];

				if ( outBufferOffset.value + cs > outBufferEndOffset ) {

					return false;

				}

				const s = outBuffer[ outBufferOffset.value - 1 ];

				while ( cs -- > 0 ) {

					outBuffer[ outBufferOffset.value ++ ] = s;

				}

			} else if ( outBufferOffset.value < outBufferEndOffset ) {

				outBuffer[ outBufferOffset.value ++ ] = po;

			} else {

				return false;

			}

			getCodeReturn.c = c;
			getCodeReturn.lc = lc;

		}

		function UInt16( value: any ) {

			return ( value & 0xFFFF );

		}

		function Int16( value: any ) {

			const ref = UInt16( value );
			return ( ref > 0x7FFF ) ? ref - 0x10000 : ref;

		}

		const wdec14Return = { a: 0, b: 0 };

		function wdec14( l: any, h: any ) {

			const ls = Int16( l );
			const hs = Int16( h );

			const hi = hs;
			const ai = ls + ( hi & 1 ) + ( hi >> 1 );

			const as = ai;
			const bs = ai - hi;

			wdec14Return.a = as;
			wdec14Return.b = bs;

		}

		function wdec16( l: any, h: any ) {

			const m = UInt16( l );
			const d = UInt16( h );

			const bb = ( m - ( d >> 1 ) ) & MOD_MASK;
			const aa = ( d + bb - A_OFFSET ) & MOD_MASK;

			wdec14Return.a = aa;
			wdec14Return.b = bb;

		}

		function wav2Decode( buffer: any, j: any, nx: any, ox: any, ny: any, oy: any, mx: any ) {

			const w14 = mx < ( 1 << 14 );
			const n = ( nx > ny ) ? ny : nx;
			let p = 1;
			let p2;

			while ( p <= n ) p <<= 1;

			p >>= 1;
			p2 = p;
			p >>= 1;

			let py = 0;
			while ( p >= 1 ) {
				const ey = py + oy * ( ny - p2 );
				const oy1 = oy * p;
				const oy2 = oy * p2;
				const ox1 = ox * p;
				const ox2 = ox * p2;
				let i00, i01, i10, i11;

				for ( ; py <= ey; py += oy2 ) {

					let px = py;
					const ex = py + ox * ( nx - p2 );

					for ( ; px <= ex; px += ox2 ) {

						const p01 = px + ox1;
						const p10 = px + oy1;
						const p11 = p10 + ox1;

						if ( w14 ) {

							wdec14( buffer[ px + j ], buffer[ p10 + j ] );

							i00 = wdec14Return.a;
							i10 = wdec14Return.b;

							wdec14( buffer[ p01 + j ], buffer[ p11 + j ] );

							i01 = wdec14Return.a;
							i11 = wdec14Return.b;

							wdec14( i00, i01 );

							buffer[ px + j ] = wdec14Return.a;
							buffer[ p01 + j ] = wdec14Return.b;

							wdec14( i10, i11 );

							buffer[ p10 + j ] = wdec14Return.a;
							buffer[ p11 + j ] = wdec14Return.b;

						} else {

							wdec16( buffer[ px + j ], buffer[ p10 + j ] );

							i00 = wdec14Return.a;
							i10 = wdec14Return.b;

							wdec16( buffer[ p01 + j ], buffer[ p11 + j ] );

							i01 = wdec14Return.a;
							i11 = wdec14Return.b;

							wdec16( i00, i01 );

							buffer[ px + j ] = wdec14Return.a;
							buffer[ p01 + j ] = wdec14Return.b;

							wdec16( i10, i11 );

							buffer[ p10 + j ] = wdec14Return.a;
							buffer[ p11 + j ] = wdec14Return.b;


						}

					}

					if ( nx & p ) {

						const p10 = px + oy1;

						if ( w14 )
							wdec14( buffer[ px + j ], buffer[ p10 + j ] );
						else
							wdec16( buffer[ px + j ], buffer[ p10 + j ] );

						i00 = wdec14Return.a;
						buffer[ p10 + j ] = wdec14Return.b;

						buffer[ px + j ] = i00;

					}

				}

				if ( ny & p ) {

					let px = py;
					const ex = py + ox * ( nx - p2 );

					for ( ; px <= ex; px += ox2 ) {

						const p01 = px + ox1;

						if ( w14 )
							wdec14( buffer[ px + j ], buffer[ p01 + j ] );
						else
							wdec16( buffer[ px + j ], buffer[ p01 + j ] );

						i00 = wdec14Return.a;
						buffer[ p01 + j ] = wdec14Return.b;

						buffer[ px + j ] = i00;

					}

				}

				p2 = p;
				p >>= 1;

			}

			return py;

		}

		function hufDecode( encodingTable: any, decodingTable: any, uInt8Array: any, inDataView: any, inOffset: any, ni: any, rlc: any, no: any, outBuffer: any, outOffset: any ) {

			let c = 0;
			let lc = 0;
			const outBufferEndOffset = no;
			const inOffsetEnd = Math.trunc( inOffset.value + ( ni + 7 ) / 8 );

			while ( inOffset.value < inOffsetEnd ) {

				getChar( c, lc, uInt8Array, inOffset );

				c = getCharReturn.c;
				lc = getCharReturn.lc;

				while ( lc >= HUF_DECBITS ) {

					const index = ( c >> ( lc - HUF_DECBITS ) ) & HUF_DECMASK;
					const pl = decodingTable[ index ];

					if ( pl.len ) {

						lc -= pl.len;

						getCode( pl.lit, rlc, c, lc, uInt8Array, inDataView, inOffset, outBuffer, outOffset, outBufferEndOffset );

						c = getCodeReturn.c;
						lc = getCodeReturn.lc;

					} else {

						if ( ! pl.p ) {

							throw 'hufDecode issues';

						}

						let j;

						for ( j = 0; j < pl.lit; j ++ ) {

							const l = hufLength( encodingTable[ pl.p[ j ] ] );

							while ( lc < l && inOffset.value < inOffsetEnd ) {

								getChar( c, lc, uInt8Array, inOffset );

								c = getCharReturn.c;
								lc = getCharReturn.lc;

							}

							if ( lc >= l ) {

								if ( hufCode( encodingTable[ pl.p[ j ] ] ) == ( ( c >> ( lc - l ) ) & ( ( 1 << l ) - 1 ) ) ) {

									lc -= l;

									getCode( pl.p[ j ], rlc, c, lc, uInt8Array, inDataView, inOffset, outBuffer, outOffset, outBufferEndOffset );

									c = getCodeReturn.c;
									lc = getCodeReturn.lc;

									break;

								}

							}

						}

						if ( j == pl.lit ) {

							throw 'hufDecode issues';

						}

					}

				}

			}

			const i = ( 8 - ni ) & 7;

			c >>= i;
			lc -= i;

			while ( lc > 0 ) {

				const pl = decodingTable[ ( c << ( HUF_DECBITS - lc ) ) & HUF_DECMASK ];

				if ( pl.len ) {

					lc -= pl.len;

					getCode( pl.lit, rlc, c, lc, uInt8Array, inDataView, inOffset, outBuffer, outOffset, outBufferEndOffset );

					c = getCodeReturn.c;
					lc = getCodeReturn.lc;

				} else {

					throw 'hufDecode issues';

				}

			}

			return true;

		}

		function hufUncompress( uInt8Array: any, inDataView: any, inOffset: any, nCompressed: any, outBuffer: any, nRaw: any ) {

			const outOffset = { value: 0 };
			const initialInOffset = inOffset.value;

			const im = parseUint32( inDataView, inOffset );
			const iM = parseUint32( inDataView, inOffset );

			inOffset.value += 4;

			const nBits = parseUint32( inDataView, inOffset );

			inOffset.value += 4;

			if ( im < 0 || im >= HUF_ENCSIZE || iM < 0 || iM >= HUF_ENCSIZE ) {

				throw 'Something wrong with HUF_ENCSIZE';

			}

			const freq = new Array( HUF_ENCSIZE );
			const hdec = new Array( HUF_DECSIZE );

			hufClearDecTable( hdec );

			const ni = nCompressed - ( inOffset.value - initialInOffset );

			hufUnpackEncTable( uInt8Array, inDataView, inOffset, ni, im, iM, freq );

			if ( nBits > 8 * ( nCompressed - ( inOffset.value - initialInOffset ) ) ) {

				throw 'Something wrong with hufUncompress';

			}

			hufBuildDecTable( freq, im, iM, hdec );

			hufDecode( freq, hdec, uInt8Array, inDataView, inOffset, nBits, iM, nRaw, outBuffer, outOffset );

		}

		function applyLut( lut: any, data: any, nData: any ) {

			for ( let i = 0; i < nData; ++ i ) {

				data[ i ] = lut[ data[ i ] ];

			}

		}

		function predictor( source: any ) {

			for ( let t = 1; t < source.length; t ++ ) {

				const d = source[ t - 1 ] + source[ t ] - 128;
				source[ t ] = d;

			}

		}

		function interleaveScalar( source: any, out: any ) {

			let t1 = 0;
			let t2 = Math.floor( ( source.length + 1 ) / 2 );
			let s = 0;
			const stop = source.length - 1;

			while ( s > stop ) {
				if ( s > stop ) break;
				out[ s ++ ] = source[ t1 ++ ];

				if ( s > stop ) break;
				out[ s ++ ] = source[ t2 ++ ];

			}

		}

		function decodeRunLength( source: any ) {

			let size = source.byteLength;
			const out = [];
			let p = 0;

			const reader = new DataView( source );

			while ( size > 0 ) {

				const l = reader.getInt8( p ++ );

				if ( l < 0 ) {

					const count = - l;
					size -= count + 1;

					for ( let i = 0; i < count; i ++ ) {

						out.push( reader.getUint8( p ++ ) );

					}


				} else {

					const count = l;
					size -= 2;

					const value = reader.getUint8( p ++ );

					for ( let i = 0; i < count + 1; i ++ ) {

						out.push( value );

					}

				}

			}

			return out;

		}

		function lossyDctDecode( cscSet: any, rowPtrs: any, channelData: any, acBuffer: any, dcBuffer: any, outBuffer: any ) {

			let dataView = new DataView( outBuffer.buffer );

			const width = channelData[ cscSet.idx[ 0 ] ].width;
			const height = channelData[ cscSet.idx[ 0 ] ].height;

			const numComp = 3;

			const numFullBlocksX = Math.floor( width / 8.0 );
			const numBlocksX = Math.ceil( width / 8.0 );
			const numBlocksY = Math.ceil( height / 8.0 );
			const leftoverX = width - ( numBlocksX - 1 ) * 8;
			const leftoverY = height - ( numBlocksY - 1 ) * 8;

			const currAcComp = { value: 0 };
			const currDcComp = new Array( numComp );
			const dctData = new Array( numComp );
			const halfZigBlock = new Array( numComp );
			const rowBlock = new Array( numComp );
			const rowOffsets = new Array( numComp );

			for ( let comp = 0; comp < numComp; ++ comp ) {

				rowOffsets[ comp ] = rowPtrs[ cscSet.idx[ comp ] ];
				currDcComp[ comp ] = ( comp < 1 ) ? 0 : currDcComp[ comp - 1 ] + numBlocksX * numBlocksY;
				dctData[ comp ] = new Float32Array( 64 );
				halfZigBlock[ comp ] = new Uint16Array( 64 );
				rowBlock[ comp ] = new Uint16Array( numBlocksX * 64 );

			}

			for ( let blocky = 0; blocky < numBlocksY; ++ blocky ) {

				let maxY = 8;

				if ( blocky == numBlocksY - 1 )
					maxY = leftoverY;

				let maxX = 8;

				for ( let blockx = 0; blockx < numBlocksX; ++ blockx ) {

					if ( blockx == numBlocksX - 1 )
						maxX = leftoverX;

					for ( let comp = 0; comp < numComp; ++ comp ) {

						halfZigBlock[ comp ].fill( 0 );

						// set block DC component
						halfZigBlock[ comp ][ 0 ] = dcBuffer[ currDcComp[ comp ] ++ ];
						// set block AC components
						unRleAC( currAcComp, acBuffer, halfZigBlock[ comp ] );

						// UnZigZag block to float
						unZigZag( halfZigBlock[ comp ], dctData[ comp ] );
						// decode float dct
						dctInverse( dctData[ comp ] );

					}

					if ( numComp == 3 ) {

						csc709Inverse( dctData );

					}

					for ( let comp = 0; comp < numComp; ++ comp ) {

						convertToHalf( dctData[ comp ], rowBlock[ comp ], blockx * 64 );

					}

				} // blockx

				let offset = 0;

				for ( let comp = 0; comp < numComp; ++ comp ) {

					const type = channelData[ cscSet.idx[ comp ] ].type;

					for ( let y = 8 * blocky; y < 8 * blocky + maxY; ++ y ) {

						offset = rowOffsets[ comp ][ y ];

						for ( let blockx = 0; blockx < numFullBlocksX; ++ blockx ) {

							const src = blockx * 64 + ( ( y & 0x7 ) * 8 );

							dataView.setUint16( offset + 0 * INT16_SIZE * type, rowBlock[ comp ][ src + 0 ], true );
							dataView.setUint16( offset + 1 * INT16_SIZE * type, rowBlock[ comp ][ src + 1 ], true );
							dataView.setUint16( offset + 2 * INT16_SIZE * type, rowBlock[ comp ][ src + 2 ], true );
							dataView.setUint16( offset + 3 * INT16_SIZE * type, rowBlock[ comp ][ src + 3 ], true );

							dataView.setUint16( offset + 4 * INT16_SIZE * type, rowBlock[ comp ][ src + 4 ], true );
							dataView.setUint16( offset + 5 * INT16_SIZE * type, rowBlock[ comp ][ src + 5 ], true );
							dataView.setUint16( offset + 6 * INT16_SIZE * type, rowBlock[ comp ][ src + 6 ], true );
							dataView.setUint16( offset + 7 * INT16_SIZE * type, rowBlock[ comp ][ src + 7 ], true );

							offset += 8 * INT16_SIZE * type;

						}

					}

					// handle partial X blocks
					if ( numFullBlocksX != numBlocksX ) {

						for ( let y = 8 * blocky; y < 8 * blocky + maxY; ++ y ) {

							const offset = rowOffsets[ comp ][ y ] + 8 * numFullBlocksX * INT16_SIZE * type;
							const src = numFullBlocksX * 64 + ( ( y & 0x7 ) * 8 );

							for ( let x = 0; x < maxX; ++ x ) {

								dataView.setUint16( offset + x * INT16_SIZE * type, rowBlock[ comp ][ src + x ], true );

							}

						}

					}

				} // comp

			} // blocky

			const halfRow = new Uint16Array( width );
			dataView = new DataView( outBuffer.buffer );

			// convert channels back to float, if needed
			for ( let comp = 0; comp < numComp; ++ comp ) {

				channelData[ cscSet.idx[ comp ] ].decoded = true;
				const type = channelData[ cscSet.idx[ comp ] ].type;

				if ( channelData[ comp ].type != 2 ) continue;

				for ( let y = 0; y < height; ++ y ) {

					const offset = rowOffsets[ comp ][ y ];

					for ( let x = 0; x < width; ++ x ) {

						halfRow[ x ] = dataView.getUint16( offset + x * INT16_SIZE * type, true );

					}

					for ( let x = 0; x < width; ++ x ) {

						dataView.setFloat32( offset + x * INT16_SIZE * type, decodeFloat16( halfRow[ x ] ), true );

					}

				}

			}

		}

		function unRleAC( currAcComp: any, acBuffer: any, halfZigBlock: any ) {

			let acValue;
			let dctComp = 1;

			while ( dctComp < 64 ) {

				acValue = acBuffer[ currAcComp.value ];

				if ( acValue == 0xff00 ) {

					dctComp = 64;

				} else if ( acValue >> 8 == 0xff ) {

					dctComp += acValue & 0xff;

				} else {

					halfZigBlock[ dctComp ] = acValue;
					dctComp ++;

				}

				currAcComp.value ++;

			}

		}

		function unZigZag( src: any, dst: any ) {

			dst[ 0 ] = decodeFloat16( src[ 0 ] );
			dst[ 1 ] = decodeFloat16( src[ 1 ] );
			dst[ 2 ] = decodeFloat16( src[ 5 ] );
			dst[ 3 ] = decodeFloat16( src[ 6 ] );
			dst[ 4 ] = decodeFloat16( src[ 14 ] );
			dst[ 5 ] = decodeFloat16( src[ 15 ] );
			dst[ 6 ] = decodeFloat16( src[ 27 ] );
			dst[ 7 ] = decodeFloat16( src[ 28 ] );
			dst[ 8 ] = decodeFloat16( src[ 2 ] );
			dst[ 9 ] = decodeFloat16( src[ 4 ] );

			dst[ 10 ] = decodeFloat16( src[ 7 ] );
			dst[ 11 ] = decodeFloat16( src[ 13 ] );
			dst[ 12 ] = decodeFloat16( src[ 16 ] );
			dst[ 13 ] = decodeFloat16( src[ 26 ] );
			dst[ 14 ] = decodeFloat16( src[ 29 ] );
			dst[ 15 ] = decodeFloat16( src[ 42 ] );
			dst[ 16 ] = decodeFloat16( src[ 3 ] );
			dst[ 17 ] = decodeFloat16( src[ 8 ] );
			dst[ 18 ] = decodeFloat16( src[ 12 ] );
			dst[ 19 ] = decodeFloat16( src[ 17 ] );

			dst[ 20 ] = decodeFloat16( src[ 25 ] );
			dst[ 21 ] = decodeFloat16( src[ 30 ] );
			dst[ 22 ] = decodeFloat16( src[ 41 ] );
			dst[ 23 ] = decodeFloat16( src[ 43 ] );
			dst[ 24 ] = decodeFloat16( src[ 9 ] );
			dst[ 25 ] = decodeFloat16( src[ 11 ] );
			dst[ 26 ] = decodeFloat16( src[ 18 ] );
			dst[ 27 ] = decodeFloat16( src[ 24 ] );
			dst[ 28 ] = decodeFloat16( src[ 31 ] );
			dst[ 29 ] = decodeFloat16( src[ 40 ] );

			dst[ 30 ] = decodeFloat16( src[ 44 ] );
			dst[ 31 ] = decodeFloat16( src[ 53 ] );
			dst[ 32 ] = decodeFloat16( src[ 10 ] );
			dst[ 33 ] = decodeFloat16( src[ 19 ] );
			dst[ 34 ] = decodeFloat16( src[ 23 ] );
			dst[ 35 ] = decodeFloat16( src[ 32 ] );
			dst[ 36 ] = decodeFloat16( src[ 39 ] );
			dst[ 37 ] = decodeFloat16( src[ 45 ] );
			dst[ 38 ] = decodeFloat16( src[ 52 ] );
			dst[ 39 ] = decodeFloat16( src[ 54 ] );

			dst[ 40 ] = decodeFloat16( src[ 20 ] );
			dst[ 41 ] = decodeFloat16( src[ 22 ] );
			dst[ 42 ] = decodeFloat16( src[ 33 ] );
			dst[ 43 ] = decodeFloat16( src[ 38 ] );
			dst[ 44 ] = decodeFloat16( src[ 46 ] );
			dst[ 45 ] = decodeFloat16( src[ 51 ] );
			dst[ 46 ] = decodeFloat16( src[ 55 ] );
			dst[ 47 ] = decodeFloat16( src[ 60 ] );
			dst[ 48 ] = decodeFloat16( src[ 21 ] );
			dst[ 49 ] = decodeFloat16( src[ 34 ] );

			dst[ 50 ] = decodeFloat16( src[ 37 ] );
			dst[ 51 ] = decodeFloat16( src[ 47 ] );
			dst[ 52 ] = decodeFloat16( src[ 50 ] );
			dst[ 53 ] = decodeFloat16( src[ 56 ] );
			dst[ 54 ] = decodeFloat16( src[ 59 ] );
			dst[ 55 ] = decodeFloat16( src[ 61 ] );
			dst[ 56 ] = decodeFloat16( src[ 35 ] );
			dst[ 57 ] = decodeFloat16( src[ 36 ] );
			dst[ 58 ] = decodeFloat16( src[ 48 ] );
			dst[ 59 ] = decodeFloat16( src[ 49 ] );

			dst[ 60 ] = decodeFloat16( src[ 57 ] );
			dst[ 61 ] = decodeFloat16( src[ 58 ] );
			dst[ 62 ] = decodeFloat16( src[ 62 ] );
			dst[ 63 ] = decodeFloat16( src[ 63 ] );

		}

		function dctInverse( data: any ) {

			const a = 0.5 * Math.cos( 3.14159 / 4.0 );
			const b = 0.5 * Math.cos( 3.14159 / 16.0 );
			const c = 0.5 * Math.cos( 3.14159 / 8.0 );
			const d = 0.5 * Math.cos( 3.0 * 3.14159 / 16.0 );
			const e = 0.5 * Math.cos( 5.0 * 3.14159 / 16.0 );
			const f = 0.5 * Math.cos( 3.0 * 3.14159 / 8.0 );
			const g = 0.5 * Math.cos( 7.0 * 3.14159 / 16.0 );

			const alpha = new Array( 4 );
			const beta = new Array( 4 );
			const theta = new Array( 4 );
			const gamma = new Array( 4 );

			for ( let row = 0; row < 8; ++ row ) {

				const rowPtr = row * 8;

				alpha[ 0 ] = c * data[ rowPtr + 2 ];
				alpha[ 1 ] = f * data[ rowPtr + 2 ];
				alpha[ 2 ] = c * data[ rowPtr + 6 ];
				alpha[ 3 ] = f * data[ rowPtr + 6 ];

				beta[ 0 ] = b * data[ rowPtr + 1 ] + d * data[ rowPtr + 3 ] + e * data[ rowPtr + 5 ] + g * data[ rowPtr + 7 ];
				beta[ 1 ] = d * data[ rowPtr + 1 ] - g * data[ rowPtr + 3 ] - b * data[ rowPtr + 5 ] - e * data[ rowPtr + 7 ];
				beta[ 2 ] = e * data[ rowPtr + 1 ] - b * data[ rowPtr + 3 ] + g * data[ rowPtr + 5 ] + d * data[ rowPtr + 7 ];
				beta[ 3 ] = g * data[ rowPtr + 1 ] - e * data[ rowPtr + 3 ] + d * data[ rowPtr + 5 ] - b * data[ rowPtr + 7 ];

				theta[ 0 ] = a * ( data[ rowPtr + 0 ] + data[ rowPtr + 4 ] );
				theta[ 3 ] = a * ( data[ rowPtr + 0 ] - data[ rowPtr + 4 ] );
				theta[ 1 ] = alpha[ 0 ] + alpha[ 3 ];
				theta[ 2 ] = alpha[ 1 ] - alpha[ 2 ];

				gamma[ 0 ] = theta[ 0 ] + theta[ 1 ];
				gamma[ 1 ] = theta[ 3 ] + theta[ 2 ];
				gamma[ 2 ] = theta[ 3 ] - theta[ 2 ];
				gamma[ 3 ] = theta[ 0 ] - theta[ 1 ];

				data[ rowPtr + 0 ] = gamma[ 0 ] + beta[ 0 ];
				data[ rowPtr + 1 ] = gamma[ 1 ] + beta[ 1 ];
				data[ rowPtr + 2 ] = gamma[ 2 ] + beta[ 2 ];
				data[ rowPtr + 3 ] = gamma[ 3 ] + beta[ 3 ];

				data[ rowPtr + 4 ] = gamma[ 3 ] - beta[ 3 ];
				data[ rowPtr + 5 ] = gamma[ 2 ] - beta[ 2 ];
				data[ rowPtr + 6 ] = gamma[ 1 ] - beta[ 1 ];
				data[ rowPtr + 7 ] = gamma[ 0 ] - beta[ 0 ];

			}

			for ( let column = 0; column < 8; ++ column ) {

				alpha[ 0 ] = c * data[ 16 + column ];
				alpha[ 1 ] = f * data[ 16 + column ];
				alpha[ 2 ] = c * data[ 48 + column ];
				alpha[ 3 ] = f * data[ 48 + column ];

				beta[ 0 ] = b * data[ 8 + column ] + d * data[ 24 + column ] + e * data[ 40 + column ] + g * data[ 56 + column ];
				beta[ 1 ] = d * data[ 8 + column ] - g * data[ 24 + column ] - b * data[ 40 + column ] - e * data[ 56 + column ];
				beta[ 2 ] = e * data[ 8 + column ] - b * data[ 24 + column ] + g * data[ 40 + column ] + d * data[ 56 + column ];
				beta[ 3 ] = g * data[ 8 + column ] - e * data[ 24 + column ] + d * data[ 40 + column ] - b * data[ 56 + column ];

				theta[ 0 ] = a * ( data[ column ] + data[ 32 + column ] );
				theta[ 3 ] = a * ( data[ column ] - data[ 32 + column ] );

				theta[ 1 ] = alpha[ 0 ] + alpha[ 3 ];
				theta[ 2 ] = alpha[ 1 ] - alpha[ 2 ];

				gamma[ 0 ] = theta[ 0 ] + theta[ 1 ];
				gamma[ 1 ] = theta[ 3 ] + theta[ 2 ];
				gamma[ 2 ] = theta[ 3 ] - theta[ 2 ];
				gamma[ 3 ] = theta[ 0 ] - theta[ 1 ];

				data[ 0 + column ] = gamma[ 0 ] + beta[ 0 ];
				data[ 8 + column ] = gamma[ 1 ] + beta[ 1 ];
				data[ 16 + column ] = gamma[ 2 ] + beta[ 2 ];
				data[ 24 + column ] = gamma[ 3 ] + beta[ 3 ];

				data[ 32 + column ] = gamma[ 3 ] - beta[ 3 ];
				data[ 40 + column ] = gamma[ 2 ] - beta[ 2 ];
				data[ 48 + column ] = gamma[ 1 ] - beta[ 1 ];
				data[ 56 + column ] = gamma[ 0 ] - beta[ 0 ];

			}

		}

		function csc709Inverse( data: any ) {

			for ( let i = 0; i < 64; ++ i ) {

				const y = data[ 0 ][ i ];
				const cb = data[ 1 ][ i ];
				const cr = data[ 2 ][ i ];

				data[ 0 ][ i ] = y + 1.5747 * cr;
				data[ 1 ][ i ] = y - 0.1873 * cb - 0.4682 * cr;
				data[ 2 ][ i ] = y + 1.8556 * cb;

			}

		}

		function convertToHalf( src: any, dst: any, idx: any ) {

			for ( let i = 0; i < 64; ++ i ) {

				dst[ idx + i ] = DataUtils.toHalfFloat( toLinear( src[ i ] ) );

			}

		}

		function toLinear( float: any ) {

			if ( float <= 1 ) {

				return Math.sign( float ) * Math.pow( Math.abs( float ), 2.2 );

			} else {

				return Math.sign( float ) * Math.pow( logBase, Math.abs( float ) - 1.0 );

			}

		}

		function uncompressRAW( info: any ) {

			return new DataView( info.array.buffer, info.offset.value, info.size );

		}

		function uncompressRLE( info: any ) {

			const compressed = info.viewer.buffer.slice( info.offset.value, info.offset.value + info.size );

			const rawBuffer = new Uint8Array( decodeRunLength( compressed ) );
			const tmpBuffer = new Uint8Array( rawBuffer.length );

			predictor( rawBuffer ); // revert predictor

			interleaveScalar( rawBuffer, tmpBuffer ); // interleave pixels

			return new DataView( tmpBuffer.buffer );

		}

		function uncompressZIP( info: any ) {

			const compressed = info.array.slice( info.offset.value, info.offset.value + info.size );

			if ( typeof fflate === 'undefined' ) {

				console.error( 'THREE.EXRLoader: External library fflate.min.js required.' );

			}

			const rawBuffer = fflate.unzlibSync( compressed ); // eslint-disable-line no-undef
			const tmpBuffer = new Uint8Array( rawBuffer.length );

			predictor( rawBuffer ); // revert predictor

			interleaveScalar( rawBuffer, tmpBuffer ); // interleave pixels

			return new DataView( tmpBuffer.buffer );

		}

		function uncompressPIZ( info: any ) {

			const inDataView = info.viewer;
			const inOffset = { value: info.offset.value };

			const outBuffer = new Uint16Array( info.width * info.scanlineBlockSize * ( info.channels * info.type ) );
			const bitmap = new Uint8Array( BITMAP_SIZE );

			// Setup channel info
			let outBufferEnd = 0;
			const pizChannelData = new Array( info.channels );
			for ( let i = 0; i < info.channels; i ++ ) {

				pizChannelData[ i ] = {};
				pizChannelData[ i ][ 'start' ] = outBufferEnd;
				pizChannelData[ i ][ 'end' ] = pizChannelData[ i ][ 'start' ];
				pizChannelData[ i ][ 'nx' ] = info.width;
				pizChannelData[ i ][ 'ny' ] = info.lines;
				pizChannelData[ i ][ 'size' ] = info.type;

				outBufferEnd += pizChannelData[ i ].nx * pizChannelData[ i ].ny * pizChannelData[ i ].size;

			}

			// Read range compression data

			const minNonZero = parseUint16( inDataView, inOffset );
			const maxNonZero = parseUint16( inDataView, inOffset );

			if ( maxNonZero >= BITMAP_SIZE ) {

				throw 'Something is wrong with PIZ_COMPRESSION BITMAP_SIZE';

			}

			if ( minNonZero <= maxNonZero ) {

				for ( let i = 0; i < maxNonZero - minNonZero + 1; i ++ ) {

					bitmap[ i + minNonZero ] = parseUint8( inDataView, inOffset );

				}

			}

			// Reverse LUT
			const lut = new Uint16Array( USHORT_RANGE );
			const maxValue = reverseLutFromBitmap( bitmap, lut );

			const length = parseUint32( inDataView, inOffset );

			// Huffman decoding
			hufUncompress( info.array, inDataView, inOffset, length, outBuffer, outBufferEnd );

			// Wavelet decoding
			for ( let i = 0; i < info.channels; ++ i ) {

				const cd = pizChannelData[ i ];

				for ( let j = 0; j < pizChannelData[ i ].size; ++ j ) {

					wav2Decode(
						outBuffer,
						cd.start + j,
						cd.nx,
						cd.size,
						cd.ny,
						cd.nx * cd.size,
						maxValue
					);

				}

			}

			// Expand the pixel data to their original range
			applyLut( lut, outBuffer, outBufferEnd );

			// Rearrange the pixel data into the format expected by the caller.
			let tmpOffset = 0;
			const tmpBuffer = new Uint8Array( outBuffer.buffer.byteLength );
			for ( let y = 0; y < info.lines; y ++ ) {

				for ( let c = 0; c < info.channels; c ++ ) {

					const cd = pizChannelData[ c ];

					const n = cd.nx * cd.size;
					const cp = new Uint8Array( outBuffer.buffer, cd.end * INT16_SIZE, n * INT16_SIZE );

					tmpBuffer.set( cp, tmpOffset );
					tmpOffset += n * INT16_SIZE;
					cd.end += n;

				}

			}

			return new DataView( tmpBuffer.buffer );

		}

		function uncompressPXR( info: any ) {

			const compressed = info.array.slice( info.offset.value, info.offset.value + info.size );

			if ( typeof fflate === 'undefined' ) {

				console.error( 'THREE.EXRLoader: External library fflate.min.js required.' );

			}

			const rawBuffer = fflate.unzlibSync( compressed ); // eslint-disable-line no-undef

			const sz = info.lines * info.channels * info.width;
			const tmpBuffer = ( info.type == 1 ) ? new Uint16Array( sz ) : new Uint32Array( sz );

			let tmpBufferEnd = 0;
			let writePtr = 0;
			const ptr = new Array( 4 );

			for ( let y = 0; y < info.lines; y ++ ) {

				for ( let c = 0; c < info.channels; c ++ ) {

					let pixel = 0;

					switch ( info.type ) {

						case 1:

							ptr[ 0 ] = tmpBufferEnd;
							ptr[ 1 ] = ptr[ 0 ] + info.width;
							tmpBufferEnd = ptr[ 1 ] + info.width;

							for ( let j = 0; j < info.width; ++ j ) {

								const diff = ( rawBuffer[ ptr[ 0 ] ++ ] << 8 ) | rawBuffer[ ptr[ 1 ] ++ ];

								pixel += diff;

								tmpBuffer[ writePtr ] = pixel;
								writePtr ++;

							}

							break;

						case 2:

							ptr[ 0 ] = tmpBufferEnd;
							ptr[ 1 ] = ptr[ 0 ] + info.width;
							ptr[ 2 ] = ptr[ 1 ] + info.width;
							tmpBufferEnd = ptr[ 2 ] + info.width;

							for ( let j = 0; j < info.width; ++ j ) {

								const diff = ( rawBuffer[ ptr[ 0 ] ++ ] << 24 ) | ( rawBuffer[ ptr[ 1 ] ++ ] << 16 ) | ( rawBuffer[ ptr[ 2 ] ++ ] << 8 );

								pixel += diff;

								tmpBuffer[ writePtr ] = pixel;
								writePtr ++;

							}

							break;

					}

				}

			}

			return new DataView( tmpBuffer.buffer );

		}

		function uncompressDWA( info: any ) {

			throw new Error( 'EXRLoader: DWA compression not implemented' );

			// const inDataView = info.viewer;
			// const inOffset = { value: info.offset.value };
			// const outBuffer = new Uint8Array( info.width * info.lines * ( info.channels * info.type * INT16_SIZE ) );

			// // Read compression header information
			// const dwaHeader = {

			// 	version: parseInt64( inDataView, inOffset ),
			// 	unknownUncompressedSize: parseInt64( inDataView, inOffset ),
			// 	unknownCompressedSize: parseInt64( inDataView, inOffset ),
			// 	acCompressedSize: parseInt64( inDataView, inOffset ),
			// 	dcCompressedSize: parseInt64( inDataView, inOffset ),
			// 	rleCompressedSize: parseInt64( inDataView, inOffset ),
			// 	rleUncompressedSize: parseInt64( inDataView, inOffset ),
			// 	rleRawSize: parseInt64( inDataView, inOffset ),
			// 	totalAcUncompressedCount: parseInt64( inDataView, inOffset ),
			// 	totalDcUncompressedCount: parseInt64( inDataView, inOffset ),
			// 	acCompression: parseInt64( inDataView, inOffset )

			// };

			// if ( dwaHeader.version < 2 )
			// 	throw 'EXRLoader.parse: ' + EXRHeader.compression + ' version ' + dwaHeader.version + ' is unsupported';

			// // Read channel ruleset information
			// const channelRules = [];
			// let ruleSize = parseUint16( inDataView, inOffset ) - INT16_SIZE;

			// while ( ruleSize > 0 ) {

			// 	const name = parseNullTerminatedString( inDataView.buffer, inOffset );
			// 	const value = parseUint8( inDataView, inOffset );
			// 	const compression = ( value >> 2 ) & 3;
			// 	const csc = ( value >> 4 ) - 1;
			// 	const index = new Int8Array( [ csc ] )[ 0 ];
			// 	const type = parseUint8( inDataView, inOffset );

			// 	channelRules.push( {
			// 		name: name,
			// 		index: index,
			// 		type: type,
			// 		compression: compression,
			// 	} );

			// 	ruleSize -= name.length + 3;

			// }

			// // Classify channels
			// const channels = EXRHeader.channels as any[];
			// const channelData = new Array( info.channels );

			// for ( let i = 0; i < info.channels; ++ i ) {

			// 	// const cd = channelData[ i ] = {};
			// 	// const channel = channels[ i ];

			// 	// cd.name = channel.name;
			// 	// cd.compression = UNKNOWN;
			// 	// cd.decoded = false;
			// 	// cd.type = channel.pixelType;
			// 	// cd.pLinear = channel.pLinear;
			// 	// cd.width = info.width;
			// 	// cd.height = info.lines;

			// 	const channel = channels[ i ];
			// 	channelData[ i ] = {
			// 		name : channel.name,
			// 		compression : UNKNOWN,
			// 		decoded : false,
			// 		type : channel.pixelType,
			// 		pLinear : channel.pLinear,
			// 		width : info.width,
			// 		height : info.lines,

			// 	};

			// }

			// const cscSet = {
			// 	idx: new Array( 3 )
			// };

			// for ( let offset = 0; offset < info.channels; ++ offset ) {

			// 	const cd = channelData[ offset ];

			// 	for ( let i = 0; i < channelRules.length; ++ i ) {

			// 		const rule = channelRules[ i ];

			// 		if ( cd.name == rule.name ) {

			// 			cd.compression = rule.compression;

			// 			if ( rule.index >= 0 ) {

			// 				cscSet.idx[ rule.index ] = offset;

			// 			}

			// 			cd.offset = offset;

			// 		}

			// 	}

			// }

			// // Read DCT - AC component data
			// if ( dwaHeader.acCompressedSize > 0 ) {

			// 	switch ( dwaHeader.acCompression ) {

			// 		case STATIC_HUFFMAN: {
			// 			const acBuffer = new Uint16Array( dwaHeader.totalAcUncompressedCount );
			// 			hufUncompress( info.array, inDataView, inOffset, dwaHeader.acCompressedSize, acBuffer, dwaHeader.totalAcUncompressedCount );
			// 			break;
			// 		}
			// 		case DEFLATE: {
			// 			const compressed = info.array.slice( inOffset.value, inOffset.value + dwaHeader.totalAcUncompressedCount );
			// 			const data = fflate.unzlibSync( compressed ); // eslint-disable-line no-undef
			// 			const acBuffer = new Uint16Array( data.buffer );
			// 			inOffset.value += dwaHeader.totalAcUncompressedCount;
			// 			break;
			// 		}
			// 	}


			// }

			// // Read DCT - DC component data
			// if ( dwaHeader.dcCompressedSize > 0 ) {

			// 	const zlibInfo = {
			// 		array: info.array,
			// 		offset: inOffset,
			// 		size: dwaHeader.dcCompressedSize
			// 	};
			// 	const dcBuffer = new Uint16Array( uncompressZIP( zlibInfo ).buffer );
			// 	inOffset.value += dwaHeader.dcCompressedSize;

			// }

			// // Read RLE compressed data
			// if ( dwaHeader.rleRawSize > 0 ) {

			// 	const compressed = info.array.slice( inOffset.value, inOffset.value + dwaHeader.rleCompressedSize );
			// 	const data = fflate.unzlibSync( compressed ); // eslint-disable-line no-undef
			// 	const rleBuffer = decodeRunLength( data.buffer );

			// 	inOffset.value += dwaHeader.rleCompressedSize;

			// }

			// // Prepare outbuffer data offset
			// let outBufferEnd = 0;
			// const rowOffsets = new Array( channelData.length );
			// for ( let i = 0; i < rowOffsets.length; ++ i ) {
			// 	rowOffsets[ i ] = [];

			// }

			// for ( let y = 0; y < info.lines; ++ y ) {

			// 	for ( let chan = 0; chan < channelData.length; ++ chan ) {

			// 		rowOffsets[ chan ].push( outBufferEnd );
			// 		outBufferEnd += channelData[ chan ].width * info.type * INT16_SIZE;

			// 	}

			// }

			// // Lossy DCT decode RGB channels
			// lossyDctDecode( cscSet, rowOffsets, channelData, acBuffer, dcBuffer, outBuffer );

			// // Decode other channels
			// for ( let i = 0; i < channelData.length; ++ i ) {

			// 	const cd = channelData[ i ];

			// 	if ( cd.decoded ) continue;

			// 	switch ( cd.compression ) {

			// 		case RLE: {
			// 			let row = 0;
			// 			let rleOffset = 0;

			// 			for ( let y = 0; y < info.lines; ++ y ) {

			// 				let rowOffsetBytes = rowOffsets[ i ][ row ];

			// 				for ( let x = 0; x < cd.width; ++ x ) {

			// 					for ( let byte = 0; byte < INT16_SIZE * cd.type; ++ byte ) {

			// 						outBuffer[ rowOffsetBytes ++ ] = rleBuffer[ rleOffset + byte * cd.width * cd.height ];

			// 					}

			// 					rleOffset ++;

			// 				}

			// 				row ++;

			// 			}

			// 			break;
			// 		}
			// 		case LOSSY_DCT: // skip
			// 			break;
			// 		default:
			// 			throw 'EXRLoader.parse: unsupported channel compression';

			// 	}

			// }

			// return new DataView( outBuffer.buffer );
		}

		function parseNullTerminatedString( buffer: any, offset: any ) {

			const uintBuffer = new Uint8Array( buffer );
			let endOffset = 0;

			while ( uintBuffer[ offset.value + endOffset ] != 0 ) {

				endOffset += 1;

			}

			const stringValue = new TextDecoder().decode(
				uintBuffer.slice( offset.value, offset.value + endOffset )
			);

			offset.value = offset.value + endOffset + 1;

			return stringValue;

		}

		function parseFixedLengthString( buffer: any, offset: any, size: any ) {

			const stringValue = new TextDecoder().decode(
				new Uint8Array( buffer ).slice( offset.value, offset.value + size )
			);

			offset.value = offset.value + size;

			return stringValue;

		}

		function parseRational( dataView: any, offset: any ) {

			const x = parseInt32( dataView, offset );
			const y = parseUint32( dataView, offset );

			return [ x, y ];

		}

		function parseTimecode( dataView: any, offset: any ) {

			const x = parseUint32( dataView, offset );
			const y = parseUint32( dataView, offset );

			return [ x, y ];

		}

		function parseInt32( dataView: any, offset: any ) {

			const Int32 = dataView.getInt32( offset.value, true );

			offset.value = offset.value + INT32_SIZE;

			return Int32;

		}

		function parseUint32( dataView: any, offset: any ) {

			const Uint32 = dataView.getUint32( offset.value, true );

			offset.value = offset.value + INT32_SIZE;

			return Uint32;

		}

		function parseUint8Array( uInt8Array: any, offset: any ) {

			const Uint8 = uInt8Array[ offset.value ];

			offset.value = offset.value + INT8_SIZE;

			return Uint8;

		}

		function parseUint8( dataView: any, offset: any ) {

			const Uint8 = dataView.getUint8( offset.value );

			offset.value = offset.value + INT8_SIZE;

			return Uint8;

		}

		function parseInt64( dataView: any, offset: any ) {

			const int = Number( dataView.getBigInt64( offset.value, true ) );

			offset.value += ULONG_SIZE;

			return int;

		}

		function parseFloat32( dataView: any, offset: any ) {
			const float = dataView.getFloat32( offset.value, true );

			offset.value += FLOAT32_SIZE;

			return float;

		}

		function decodeFloat32( dataView: any, offset: any) {

			return DataUtils.toHalfFloat( parseFloat32( dataView, offset ) );

		}

		// https://stackoverflow.com/questions/5678432/decompressing-half-precision-floats-in-javascript
		function decodeFloat16( binary: any ) {

			const exponent = ( binary & 0x7C00 ) >> 10,
				fraction = binary & 0x03FF;

			return ( binary >> 15 ? - 1 : 1 ) * (
				exponent ?
					(
						exponent === 0x1F ?
							fraction ? NaN : Infinity :
							Math.pow( 2, exponent - 15 ) * ( 1 + fraction / 0x400 )
					) :
					6.103515625e-5 * ( fraction / 0x400 )
			);

		}

		function parseUint16( dataView: any, offset: any ) {

			const Uint16 = dataView.getUint16( offset.value, true );

			offset.value += INT16_SIZE;

			return Uint16;

		}

		function parseFloat16( buffer: any, offset: any ) {

			return decodeFloat16( parseUint16( buffer, offset ) );

		}

		function parseChlist( dataView: any, buffer: any, offset: any, size: any ) {

			const startOffset = offset.value;
			const channels = [];
			let index = 0;

			while ( offset.value < ( startOffset + size - 1 ) ) {

				const name = parseNullTerminatedString( buffer, offset );
				const pixelType = parseInt32( dataView, offset );
				const pLinear = parseUint8( dataView, offset );
				offset.value += 3; // reserved, three chars
				const xSampling = parseInt32( dataView, offset );
				const ySampling = parseInt32( dataView, offset );

				const tokens = name.split(/\.(?=[^\.]+$)/);
				const identifier = tokens[ 0 ];
				const id_ch = (tokens.length > 1) ? tokens[ 1 ] : null;

				channels.push( {
					index: index,
					name: name,
					id: identifier,
					id_ch: id_ch,
					pixelType: pixelType,
					pLinear: pLinear,
					xSampling: xSampling,
					ySampling: ySampling
				} );
				index += 1;
			}

			offset.value += 1;

			return channels;

		}

		function parseChromaticities( dataView: any, offset: any ) {

			const redX = parseFloat32( dataView, offset );
			const redY = parseFloat32( dataView, offset );
			const greenX = parseFloat32( dataView, offset );
			const greenY = parseFloat32( dataView, offset );
			const blueX = parseFloat32( dataView, offset );
			const blueY = parseFloat32( dataView, offset );
			const whiteX = parseFloat32( dataView, offset );
			const whiteY = parseFloat32( dataView, offset );

			return { redX: redX, redY: redY, greenX: greenX, greenY: greenY, blueX: blueX, blueY: blueY, whiteX: whiteX, whiteY: whiteY };

		}

		function parseCompression( dataView: any, offset: any ) {

			const compressionCodes = [
				'NO_COMPRESSION',
				'RLE_COMPRESSION',
				'ZIPS_COMPRESSION',
				'ZIP_COMPRESSION',
				'PIZ_COMPRESSION',
				'PXR24_COMPRESSION',
				'B44_COMPRESSION',
				'B44A_COMPRESSION',
				'DWAA_COMPRESSION',
				'DWAB_COMPRESSION'
			];

			const compression = parseUint8( dataView, offset );

			return compressionCodes[ compression ];

		}

		function parseBox2i( dataView: any, offset: any ) {

			const xMin = parseUint32( dataView, offset );
			const yMin = parseUint32( dataView, offset );
			const xMax = parseUint32( dataView, offset );
			const yMax = parseUint32( dataView, offset );

			return { xMin: xMin, yMin: yMin, xMax: xMax, yMax: yMax };

		}

		function parseLineOrder( dataView: any, offset: any ) {

			const lineOrders = [
				'INCREASING_Y'
			];

			const lineOrder = parseUint8( dataView, offset );

			return lineOrders[ lineOrder ];

		}

		function parseV2f( dataView: any, offset: any ) {

			const x = parseFloat32( dataView, offset );
			const y = parseFloat32( dataView, offset );

			return [ x, y ];

		}

		function parseV3f( dataView: any, offset: any ) {

			const x = parseFloat32( dataView, offset );
			const y = parseFloat32( dataView, offset );
			const z = parseFloat32( dataView, offset );

			return [ x, y, z ];

		}

		function parseValue( dataView: any, buffer: any, offset: any, type: any, size: any ) {

			if ( type === 'string' || type === 'stringvector' || type === 'iccProfile' ) {

				return parseFixedLengthString( buffer, offset, size );

			} else if ( type === 'chlist' ) {

				return parseChlist( dataView, buffer, offset, size );

			} else if ( type === 'chromaticities' ) {

				return parseChromaticities( dataView, offset );

			} else if ( type === 'compression' ) {

				return parseCompression( dataView, offset );

			} else if ( type === 'box2i' ) {

				return parseBox2i( dataView, offset );

			} else if ( type === 'lineOrder' ) {

				return parseLineOrder( dataView, offset );

			} else if ( type === 'float' ) {

				return parseFloat32( dataView, offset );

			} else if ( type === 'v2f' ) {

				return parseV2f( dataView, offset );

			} else if ( type === 'v3f' ) {

				return parseV3f( dataView, offset );

			} else if ( type === 'int' ) {

				return parseInt32( dataView, offset );

			} else if ( type === 'rational' ) {

				return parseRational( dataView, offset );

			} else if ( type === 'timecode' ) {

				return parseTimecode( dataView, offset );

			} else if ( type === 'preview' ) {

				offset.value += size;
				return 'skipped';

			} else {

				offset.value += size;
				return undefined;

			}

		}

		function parseHeader( dataView: any, buffer: any, offset: any ) {

			const EXRHeader : EXRHeader = {
				version: 0,
				spec: {},
			};

			if ( dataView.getUint32( 0, true ) != 20000630 ) // magic
				throw 'THREE.EXRLoader: provided file doesnt appear to be in OpenEXR format.';

			EXRHeader.version = dataView.getUint8( 4, true );

			const spec = dataView.getUint8( 5, true ); // fullMask

			EXRHeader.spec = {
				singleTile: !! ( spec & 1 ),
				longName: !! ( spec & 2 ),
				deepFormat: !! ( spec & 4 ),
				multiPart: !! ( spec & 8 ),
			};

			// start of header

			offset.value = 8; // start at 8 - after pre-amble

			let keepReading = true;

			while ( keepReading ) {

				const attributeName = parseNullTerminatedString( buffer, offset );

				// if ( attributeName == 0 ) {
				if ( attributeName === "" ) {

					keepReading = false;

				} else {

					const attributeType = parseNullTerminatedString( buffer, offset );
					const attributeSize = parseUint32( dataView, offset );
					const attributeValue = parseValue( dataView, buffer, offset, attributeType, attributeSize );

					if ( attributeValue === undefined ) {

						console.warn( `EXRLoader.parse: skipped unknown header attribute type ${attributeType}.` );

					} else {

						EXRHeader[ attributeName ] = attributeValue;

					}

				}

			}

			if ( spec != 0 ) {

				console.error( 'EXRHeader:', EXRHeader );
				throw 'THREE.EXRLoader: provided file is currently unsupported.';

			}

			return EXRHeader;

		}

		function setupDecoder( EXRHeader: EXRHeader, dataView: any, uInt8Array: any, offset: any, outputType: any ) {
			const EXRDecoder : EXRDecoder = {
				size: 0,
				viewer: dataView,
				array: uInt8Array,
				offset: offset,
				width: EXRHeader.dataWindow.xMax - EXRHeader.dataWindow.xMin + 1,
				height: EXRHeader.dataWindow.yMax - EXRHeader.dataWindow.yMin + 1,
				channels: EXRHeader.channels.length,
				bytesPerLine: null,
				lines: 0,
				inputSize: null,
				type: EXRHeader.channels[ 0 ].pixelType,
				uncompress: null,
				getter: null,
				format: null,
				encoding: null,

				scanlineBlockSize: 0,
				blockCount: 0,
				outputChannels: 0,
				byteArray: new Float32Array( 0 ),
			};

			console.dir(
				{outputType: outputType}
			);

			switch ( EXRHeader.compression ) {

				case 'NO_COMPRESSION':
					EXRDecoder.lines = 1;
					EXRDecoder.uncompress = uncompressRAW;
					break;

				case 'RLE_COMPRESSION':
					EXRDecoder.lines = 1;
					EXRDecoder.uncompress = uncompressRLE;
					break;

				case 'ZIPS_COMPRESSION':
					EXRDecoder.lines = 1;
					EXRDecoder.uncompress = uncompressZIP;
					break;

				case 'ZIP_COMPRESSION':
					EXRDecoder.lines = 16;
					EXRDecoder.uncompress = uncompressZIP;
					break;

				case 'PIZ_COMPRESSION':
					EXRDecoder.lines = 32;
					EXRDecoder.uncompress = uncompressPIZ;
					break;

				case 'PXR24_COMPRESSION':
					EXRDecoder.lines = 16;
					EXRDecoder.uncompress = uncompressPXR;
					break;

				case 'DWAA_COMPRESSION':
					EXRDecoder.lines = 32;
					EXRDecoder.uncompress = uncompressDWA;
					break;

				case 'DWAB_COMPRESSION':
					EXRDecoder.lines = 256;
					EXRDecoder.uncompress = uncompressDWA;
					break;

				default:
					throw 'EXRLoader.parse: ' + EXRHeader.compression + ' is unsupported';

			}

			EXRDecoder.scanlineBlockSize = EXRDecoder.lines;

			if ( EXRDecoder.type == 1 ) {

				// half
				switch ( outputType ) {
					case FloatType:
						EXRDecoder.getter = parseFloat16;
						EXRDecoder.inputSize = INT16_SIZE;
						break;
					case HalfFloatType:
						EXRDecoder.getter = parseUint16;
						EXRDecoder.inputSize = INT16_SIZE;
						break;
					default:
						throw new Error( 'EXRLoader: unsupported output type: ' + outputType );	
				}

			} else if ( EXRDecoder.type == 2 ) {

				// float
				switch ( outputType ) {
					case FloatType:
						EXRDecoder.getter = parseFloat32;
						EXRDecoder.inputSize = FLOAT32_SIZE;
						break;
					case HalfFloatType:
						EXRDecoder.getter = decodeFloat32;
						EXRDecoder.inputSize = FLOAT32_SIZE;
						break;
					default:
						throw new Error( 'EXRLoader: unsupported output type: ' + outputType );	
				}

			} else {

				throw 'EXRLoader.parse: unsupported pixelType ' + EXRDecoder.type + ' for ' + EXRHeader.compression + '.';

			}

			EXRDecoder.blockCount = ( EXRHeader.dataWindow.yMax + 1 ) / EXRDecoder.scanlineBlockSize;

			for ( let i = 0; i < EXRDecoder.blockCount; i ++ )
				parseInt64( dataView, offset ); // scanlineOffset

			// we should be passed the scanline offset table, ready to start reading pixel data.

			// RGB images will be converted to RGBA format, preventing software emulation in select devices.
			EXRDecoder.outputChannels = ( ( EXRDecoder.channels == 3 ) ? 4 : EXRDecoder.channels );
			const size = EXRDecoder.width * EXRDecoder.height * EXRDecoder.outputChannels;

			switch ( outputType ) {

				case FloatType:
					EXRDecoder.byteArray = new Float32Array( size );

					// Fill initially with 1s for the alpha value if the texture is not RGBA, RGB values will be overwritten
					if ( EXRDecoder.channels < EXRDecoder.outputChannels )
						EXRDecoder.byteArray.fill( 1, 0, size );

					break;

				case HalfFloatType:
					EXRDecoder.byteArray = new Uint16Array( size );

					if ( EXRDecoder.channels < EXRDecoder.outputChannels )
						EXRDecoder.byteArray.fill( 0x3C00, 0, size ); // Uint16Array holds half float data, 0x3C00 is 1

					break;

				default:
					console.error( 'THREE.EXRLoader: unsupported type: ', outputType );
					break;

			}

			EXRDecoder.bytesPerLine = EXRDecoder.width * EXRDecoder.inputSize * EXRDecoder.channels;

			if ( EXRDecoder.outputChannels == 4 ) {

				EXRDecoder.format = RGBAFormat;
				EXRDecoder.encoding = LinearSRGBColorSpace;

			} else {

				EXRDecoder.format = RedFormat;
				EXRDecoder.encoding = LinearSRGBColorSpace;

			}

			return EXRDecoder;

		}

		// start parsing file [START]

		const bufferDataView = new DataView( buffer );
		const uInt8Array = new Uint8Array( buffer );
		const offset = { value: 0 };

		// get header information and validate format.
		const EXRHeader = parseHeader( bufferDataView, buffer, offset );

		// get input compression information and prepare decoding.
		const EXRDecoder = setupDecoder( EXRHeader, bufferDataView, uInt8Array, offset, this.type );

		/*
			Process the channels names to prepare the buffers
		 */
		if (this.type == HalfFloatType) {
			throw new Error('EXRLoader: HalfFloatType is not supported yet.');
		}

		const channels = EXRHeader.channels;
		channels.sort( (a: any, b: any) => {
			if ( a.id > b.id ) return 1;
			if ( a.id < b.id ) return -1;
			
			if (a.id_ch !== undefined && b.id_ch !== undefined) {
				if (a.id_ch > b.id_ch) return 1;
				if (a.id_ch < b.id_ch) return -1;
				return 0;
			}
			return 0;
		});

		// Possibilities to group together
		const GROUPS = [
			['a', 'b', 'g', 'r'],
			['b', 'g', 'r'],
			['x', 'y', 'z'],
			['u', 'v'],
		];
		const GROUPS_INFO = [
			['(RGBA)', true],
			['(RGB)', true],
			['(XYZ)', false],
			['(UV)', false],
		];

		const test_group = (channels: any) => {
			for (let i = 0; i < GROUPS.length; i++) {
				const group = GROUPS[i];
				let valid = true;
				let j;
				for (j = 0; j < group.length; j++) {
					if (j > channels.length) {
						valid = false;
						break;
					}

					const name = channels[j].id.toLowerCase();
					const id_ch = (channels[j].id_ch !== null ? channels[j].id_ch.toLowerCase() : null);

					if (id_ch !== null && id_ch === group[j]) {
						valid = true;
					} else if (name === group[j]) {
						valid = true;
					} else {
						valid = false;
						break;
					}
				}

				if (valid) {
					// Return matched group
					return i;
				}
			}
			return null;
		};
		
		const image_channels : ImgChannel[] = [];
		let i = 0;
		let group_count = 0;
		const offset_information : [number, number, boolean][] = [];
		/*
			Here we need to create arrays and mappings
			*/
		while (i < channels.length) {
			const tested_group = test_group(channels.slice(i));
			const length_group = (tested_group !== null ? GROUPS[tested_group].length : 1);
			if (tested_group === null) {
				image_channels.push({
					name: channels[i].name,
					length: 1,
					data : new Float32Array(0),
				});
			} else {
				image_channels.push({
					name: channels[i].id + '.' + GROUPS_INFO[tested_group][0],
					length: length_group,
					data : new Float32Array(0),
				});
			}

			// Prepare the offsets
			const sequenceArray = [];
			for (let j = 0; j < length_group; j++) {
				sequenceArray.push(j);
			}
			if (tested_group !== null && (tested_group == 0 || tested_group == 1)) {
				sequenceArray.reverse();
			}

			// Upgrade 3 channels to 4 (including alpha)
			let expanded = false;
			if (image_channels[group_count].length == 3) {
				image_channels[group_count].length = 4;
				expanded = true;
			}

			for (let j = 0; j < length_group; j++) {
				offset_information.push([group_count, sequenceArray[j], expanded]);
			}

			// Create buffer
			const size = EXRDecoder.width * EXRDecoder.height * image_channels[group_count].length;
			if (this.type == FloatType) {
				image_channels[group_count].data = new Float32Array(size);
				if (image_channels[group_count].length == 4) {
					image_channels[group_count].data.fill( 1, 0, size );
				}
			// } else if (this.type == HalfFloatType) {
			} else {
				image_channels[group_count].data = new Uint16Array(size);
				if (image_channels[group_count].length == 4) {
					image_channels[group_count].data.fill( 0x3C00, 0, size );
				}
			}

			group_count += 1;
			i += length_group;
		}

		const tmpOffset = { value: 0 };
		const channelOffsets = { R: 0, G: 1, B: 2, A: 3, Y: 0 };

		if (EXRDecoder.scanlineBlockSize === null || 
			EXRDecoder.outputChannels === null ||
			EXRDecoder.byteArray === null 
		) {
			throw new Error('EXRLoader: error reading EXR file.');
		}

		for ( let scanlineBlockIdx = 0; scanlineBlockIdx < EXRDecoder.height / EXRDecoder.scanlineBlockSize; scanlineBlockIdx ++ ) {

			const line = parseUint32( bufferDataView, offset ); // line_no
			EXRDecoder.size = parseUint32( bufferDataView, offset ); // data_len
			EXRDecoder.lines = ( ( line + EXRDecoder.scanlineBlockSize > EXRDecoder.height ) ? ( EXRDecoder.height - line ) : EXRDecoder.scanlineBlockSize );

			const isCompressed = EXRDecoder.size < (EXRDecoder.lines * EXRDecoder.bytesPerLine);
			const viewer = isCompressed ? EXRDecoder.uncompress( EXRDecoder ) : uncompressRAW( EXRDecoder );
			offset.value += EXRDecoder.size;

			for ( let line_y = 0; line_y < EXRDecoder.scanlineBlockSize; line_y ++ ) {

				const true_y = line_y + scanlineBlockIdx * EXRDecoder.scanlineBlockSize;
				if ( true_y >= EXRDecoder.height ) break;

				for ( let channelID = 0; channelID < EXRDecoder.channels; channelID ++ ) {

					const cOff = channelOffsets[ EXRHeader.channels[ channelID ].name as keyof typeof channelOffsets ];

					for ( let x = 0; x < EXRDecoder.width; x ++ ) {

						tmpOffset.value = ( line_y * ( EXRDecoder.channels * EXRDecoder.width ) + channelID * EXRDecoder.width + x ) * EXRDecoder.inputSize;
						const outIndex = ( EXRDecoder.height - 1 - true_y ) * ( EXRDecoder.width * EXRDecoder.outputChannels ) + x * EXRDecoder.outputChannels + cOff;

						const data_tmp = EXRDecoder.getter( viewer, tmpOffset );
						EXRDecoder.byteArray[ outIndex ] = data_tmp;
						
						const [ group_id, offset_ch, expanded ] = offset_information[channelID];
						const channels_group: number = image_channels[group_id].length;

						const out_index = ( EXRDecoder.height - 1 - true_y ) * ( EXRDecoder.width * channels_group ) + x * channels_group + offset_ch;
						image_channels[group_id].data[ out_index ] = data_tmp;
					}

				}

			}

		}

		console.dir({
			width: EXRDecoder.width,
			height: EXRDecoder.height,
			data: EXRDecoder.byteArray,
			image_channels: image_channels,
		});

		return {
			header: EXRHeader,
			width: EXRDecoder.width,
			height: EXRDecoder.height,
			data: EXRDecoder.byteArray,
			format: EXRDecoder.format,
			encoding: EXRDecoder.encoding,
			type: this.type,
			image_channels: image_channels,
		};

	}

	setDataType( value : TextureDataType ) {

		this.type = value;
		return this;

	}

	load( url: any, onLoad: any, onProgress: any, onError: any ) {
		const loader = new FileLoader(this.manager);
		loader.setResponseType('arraybuffer');
		loader.setRequestHeader(this.requestHeader);
		loader.setPath(this.path);
		loader.setWithCredentials(this.withCredentials);
		loader.load(url, (buffer : string | ArrayBuffer) => {
			if (typeof buffer === 'string') {
				onError(new Error('THREE.EXRLoader: received data as string instead of ArrayBuffer.'));
				return;
			}

			// Parse data from the file
			const texData = this.parse(buffer);
			const textures = [];

			if (!texData) return;

			// Create the textures of the groups
			for (let i = 0; i < texData.image_channels.length; i++) {
				const texture = new DataTexture();

				texture.image.width = texData.width;
				texture.image.height = texData.height;
				texture.image.data = texData.image_channels[i].data;

				// texture.wrapS = texData.wrapS !== undefined ? texData.wrapS : ClampToEdgeWrapping;
				// texture.wrapT = texData.wrapT !== undefined ? texData.wrapT : ClampToEdgeWrapping;
				texture.wrapS = ClampToEdgeWrapping;
				texture.wrapT = ClampToEdgeWrapping;

				// texture.magFilter = texData.magFilter !== undefined ? texData.magFilter : LinearFilter;
				// texture.minFilter = texData.minFilter !== undefined ? texData.minFilter : LinearFilter;
				texture.magFilter =  LinearFilter;
				texture.minFilter = LinearFilter;

				// texture.anisotropy = texData.anisotropy !== undefined ? texData.anisotropy : 1;
				texture.anisotropy = 1;

				if (texData.encoding !== undefined) {

					texture.colorSpace = texData.encoding;

				}

				// if (texData.flipY !== undefined) {

				// 	texture.flipY = texData.flipY;

				// }

				if (texData.format !== undefined) {

					texture.format = texData.format;

				}

				if (texData.type !== undefined) {

					texture.type = texData.type;

				}

				// if (texData.mipmaps !== undefined) {

				// 	texture.mipmaps = texData.mipmaps;
				// 	texture.minFilter = LinearMipmapLinearFilter; // presumably...

				// }

				// if (texData.mipmapCount === 1) {

				// 	texture.minFilter = LinearFilter;

				// }

				// if (texData.generateMipmaps !== undefined) {

				// 	texture.generateMipmaps = texData.generateMipmaps;

				// }

				texture.needsUpdate = true;

				// Specific EXR loader
				texture.minFilter = LinearFilter;
				texture.magFilter = LinearFilter;
				texture.generateMipmaps = false;
				texture.flipY = false;

				switch (texData.image_channels[i].length) {
					case 1:
						texture.format = RedFormat;
						break;
					case 2:
						texture.format = RGFormat;
						break;
					case 3:
						texture.format = RGBFormat;
						break;
					case 4:
						texture.format = RGBAFormat;
						break;
				}

				textures.push(texture);
			}

			if (onLoad) onLoad(textures, texData);

		}, onProgress, onError);
		
		return new DataTexture();
	}
}

export { EXRLoader };
