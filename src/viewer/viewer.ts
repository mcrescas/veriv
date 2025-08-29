import * as Types from './types/viewer';
import { ImageManager } from './image_manager';
// @ts-ignore
import * as Shaders from './shader.js';
import { get_texture } from './colormap';

import {WebGLRenderer, Scene, OrthographicCamera, Mesh, Vector2, Vector3, ShaderMaterial, PlaneGeometry, NearestFilter, LinearFilter, Texture, Matrix4, Quaternion} from 'three'; // three/webgpu

import { Pane } from 'tweakpane';
import { BindingApi, FolderApi, SliderInputBindingApi } from '@tweakpane/core';

import { get_pixel_data, compute_metric, val2pos, format_number_stats } from './utils/pixel_utils';
import { Saver } from './saver';

/*
	Import CSS into the bundle
*/
import indexHtml from './index.html';
import indexCSS from './style.css';

function createInterceptor<T extends object>(
	target: T,
	interceptor_func: (
		methodName: keyof T,
		args: any[],
		originalMethod: (...args: any[]) => any
	) => any,
	interceptor_get: (
		propKey: keyof T,
		originalValue: any
	) => any,
): T {
	const handler: ProxyHandler<T> = {
		get(target: T, propKey: string | symbol, receiver: any): any {
			let originalValue: any;
			try {
				originalValue = Reflect.get(target, propKey, receiver);
			} catch (error) {
				originalValue = Reflect.get(target, propKey);
			}

			// Only intercept if the property is a function
			if (typeof originalValue === 'function') {
				return  (...args: any[]): any => {
					// Call the interceptor function
					return interceptor_func(
						propKey as keyof T, // Cast to keyof T for better typing
						args,
						originalValue.bind(target) // Bind 'this' to the original method
					);
				};
			} 
			else {
				return interceptor_get(propKey as keyof T, originalValue);
			}
			return originalValue;
		},
	};

	return new Proxy(target, handler) as T;
}



/*
	Main class that contains all the logic of the Viewer.
	Works in tandem with a .html file containing the elements.
*/
export class Viewer {
	document: Document;
	window: Window;
	vscode: any;
	root: ShadowRoot;

	workers_path: string[];

	/* Constants */
	readonly N_BINS_HIST: number = 400;
	readonly SCROLL_FACTOR: number = 0.9;
	readonly DRAG_FACTOR: number = 2.0;
	readonly DELTA_DRAG: number = 0;

	readonly MIN_EXPOSURE = -5.0;
	readonly MAX_EXPOSURE = 5.0;

	params !: Types.GUIParams;
	settings !: Types.Settings;

	renderer !: WebGLRenderer;
	scene !: Scene;
	camera !: OrthographicCamera;
	mesh !: Mesh;
	
	gui !: Pane;
	gui_exposure !: SliderInputBindingApi;
	gui_offset !: SliderInputBindingApi;
	gui_gamma !: SliderInputBindingApi;
	gui_open !: boolean;
	help_open !: boolean;
	reload_button !: any;
	settings_gui !: FolderApi;
	normalization_gui : BindingApi|null = null;
	normalization_info : BindingApi|null = null;

	
	img_height !: number;
	img_width !: number;

	canvasText !: HTMLCanvasElement;
	textCtx !: CanvasRenderingContext2D;
	scale_ref = 1.0;
	threshold_text = 1150.0;
	threshold_ref = 5000;

	image_manager: ImageManager;

	info_bar !: HTMLElement;
	channel_bar !: HTMLElement;

	size_plane = new Vector2(0, 0);
	size_canvas !: Vector2;

	video_playing = false;
	timer !: number;
	input_element !: HTMLInputElement;

	video_button !: HTMLElement;

	hist_canvas !: HTMLCanvasElement;
	hist_min !: HTMLElement;
	hist_max !: HTMLElement;
	hist_mean !: HTMLElement;
	hist_window !: HTMLElement;

	histogram_visible = false;
	histogram_cmp : Types.HistogramData | null = null;

	// Variables to detect drag
	startX !: number;
	startY !: number;
	position_start !: Vector3;
	drag = false;

	function_bindings !: any;
	focus_img_button = false;

	expanded_to_sidebar = false;
	image_saver !: Saver;
	spinner !: HTMLElement;

	constructor(document: Document, window: Window, root: HTMLElement, vscode: any, workers_path: string[], settings: Types.Settings) {
		this.document = document;
		this.window = window;
		this.vscode = vscode;
		this.workers_path = workers_path;
		this.settings = settings;

		if (root === undefined || root === null) {
			const viewer_host = document.createElement('div');
			this.root = viewer_host.attachShadow({ mode: 'open' });
			document.body.appendChild(viewer_host);
		} else {
			this.root = root.attachShadow({ mode: 'open' });
		}
		
		// Populate the shadow DOM 
		this.create_virtual_dom();

		// Initialize the list of images
		this.image_manager = new ImageManager(
			this.workers_path,
			this.N_BINS_HIST,
			() => { this.render(); },
		);

		// Prepare bindings for managing of event listeners
		this.prepare_bindings();
		// Cache some references to the DOM elements
		this.setup_elements_references();

		// Enable input event handling
		this.setup_key_controls(true);
		// Initialize renderer
		this.init_renderer();
		// Initialize state of the viewer
		this.init_GUI();

		/* 
			Handle commands from VSCode GUI
		*/
		window.addEventListener('message', event => {
			const message = event.data; // The JSON data our extension sent
			if (message.command === 'veriv.load') {
				this.load_image(message.paths, -1);
			} else if (message.command === 'veriv.reload-all-images') {
				this.reload_all_images();
			}
		});
		
		// Do the first update
		this.render();
		
		// Initialize the saver utility
		this.spinner = this.root.getElementById("spinner")!;
		this.image_saver = new Saver(this.vscode, this.spinner);
	}

	create_virtual_dom() {
		const head_element = this.document.createElement('head');
		const style_element = this.document.createElement('style');
		style_element.innerHTML = indexCSS as unknown as string;
		head_element.appendChild(style_element);
		this.root.appendChild(head_element);

		const body_element = this.document.createElement('body');
		body_element.style.margin = '0';
		body_element.innerHTML = indexHtml;
		body_element.setAttribute('tabindex', '0');
		this.root.appendChild(body_element);
	}	

	/*
		Store the binding functions to avoid creating new ones each time
	*/
	prepare_bindings() {
		this.function_bindings = {};
		this.function_bindings['key_input'] = this.key_input.bind(this);
		this.function_bindings['wheel_input'] = this.wheel_input.bind(this);
		this.function_bindings['close_key'] = this.close_key.bind(this);
		this.function_bindings['pointerdown'] = this.pointerdown.bind(this);
		this.function_bindings['pointermove'] = this.pointermove.bind(this);
		this.function_bindings['pointerup'] = this.pointerup.bind(this);
		this.function_bindings['canvas_mouse_move'] = this.canvas_mouse_move.bind(this);
		this.function_bindings['canvas_mouse_leave'] = this.canvas_mouse_leave.bind(this);
		this.function_bindings['copy'] = this.copy_image.bind(this);
	}

	setup_elements_references() {
		// Clean image list before tentatively updating
		if (this.info_bar !== undefined) {
			while (this.info_bar.firstChild) {
				this.info_bar.removeChild(this.info_bar.firstChild);
			}
		}

		// Hide histogram windows if not in use
		const histogram_container = this.root.getElementById("histogram-container")!;
		histogram_container.style.display = (this.settings.enableSidebar ? "none" : "initial");

		const sidebar = this.root.getElementById('sidebar')!;
		sidebar.style.display = (this.settings.enableSidebar ? "flex" : "none");

		const image_list = this.root.getElementById('image-list')!;
		image_list.style.display = (this.settings.enableSidebar ? "none" : "flex");

		if (this.settings.enableSidebar) {
			// Video controls
			this.video_button = this.root.getElementById("video_button-sidebar")!;
			this.input_element = this.root.getElementById('fps-input-sidebar')! as HTMLInputElement;

			// Histogram UI
			this.hist_min = this.root.getElementById("min-val-sidebar")!;
			this.hist_mean = this.root.getElementById("mean-val-sidebar")!;
			this.hist_max = this.root.getElementById("max-val-sidebar")!;
			this.hist_window = this.root.getElementById("histogram_window-sidebar")!;
			this.hist_canvas = this.root.getElementById("histogram-sidebar")! as HTMLCanvasElement;

			// Info bar for images
			this.info_bar = this.root.getElementById('info-bar-sidebar')!;
			
			// Setup the logic for the sidebar
			this.setup_logic_sidebar();
		} else {
			// Video controls
			this.video_button = this.root.getElementById("video_button")!;
			this.input_element = this.root.getElementById('fps-input')! as HTMLInputElement;

			// Histogram UI
			this.hist_min = this.root.getElementById("min-val")!;
			this.hist_mean = this.root.getElementById("mean-val")!;
			this.hist_max = this.root.getElementById("max-val")!;
			this.hist_window = this.root.getElementById("histogram_window")!;
			this.hist_canvas = this.root.getElementById("histogram")! as HTMLCanvasElement;

			// Info bar for images
			this.info_bar = this.root.getElementById('info-bar')!;
		}

		// Launch a resize event to update the size of the canvas
		this.window.dispatchEvent(new Event('resize'));
	}

	/*
		Bind or unbind the key events to the canvas
	*/
	setup_key_controls(enable: boolean) {
		const canvas_element = this.root.getElementById("renderer2")!;
		const body_element = this.root.querySelector('body')!;
		// const body_element = this.root.host;

		if (enable) {
			body_element.addEventListener('keydown', this.function_bindings['key_input'], { passive: false });
			body_element.addEventListener('wheel', this.function_bindings['wheel_input'], { passive: false });
			canvas_element.addEventListener('pointerdown', this.function_bindings['pointerdown']);
			canvas_element.addEventListener('pointermove', this.function_bindings['pointermove']);
			canvas_element.addEventListener('pointerup', this.function_bindings['pointerup']);
			canvas_element.addEventListener('mousemove', this.function_bindings['canvas_mouse_move']);
			canvas_element.addEventListener('mouseleave', this.function_bindings['canvas_mouse_leave']);
			canvas_element.addEventListener('copy', this.function_bindings['copy']);
		} else {
			body_element.removeEventListener('keydown', this.function_bindings['key_input']);
			body_element.removeEventListener('wheel', this.function_bindings['wheel_input']);
			canvas_element.removeEventListener('pointerdown', this.function_bindings['pointerdown']);
			canvas_element.removeEventListener('pointermove', this.function_bindings['pointermove']);
			canvas_element.removeEventListener('pointerup', this.function_bindings['pointerup']);
			canvas_element.removeEventListener('mousemove', this.function_bindings['canvas_mouse_move']);
			canvas_element.removeEventListener('mouseleave', this.function_bindings['canvas_mouse_leave']);
			canvas_element.removeEventListener('copy', this.function_bindings['copy']);
		}
	}

	/*
		Initialize the state of the viewer
	*/
	init_GUI() {
		this.params = {
			Exposure: 0.0,
			Offset: 0.0,
			Gamma: 2.2,
			Tonemap: 0,
			Metric: 0,
			Normalize: false,
			NormalizeFalseColor: false,
			NormalizeInfo: {
				x: 0.0,
				y: 0.0,
			},
			Help: () => { this.toggle_help(); this.root.querySelector('body')!.focus(); },
			Reload: this.reload_image.bind(this),
			PixelCoordinates: {x: 0, y: 0},
			PixelValues: {x: 0, y: 0, z: 0},
		};

		/*
			Create ProxiedDocument to inject correctly the style
		 */
		const proxiedDocument = createInterceptor(
			this.document, 
			(methodName, args, originalMethod) => {
				if (methodName === 'querySelector') {
					return this.root.querySelector(args[0]);
				} else if (methodName === 'append') {
					return this.root.prepend(...args);
				} else if (methodName === 'appendChild') {
					return this.root.prepend(args[0]);
				}
				return originalMethod(...args);
			},
			(propKey, originalValue) => {
				if (propKey === 'head') {
					const elem = this.root.querySelector('head')!;
					return elem;
				} else if (propKey === 'body') {
					return this.root.querySelector('body')!;
				}
				return originalValue;
			}
		);

		this.gui = new Pane({
			title : 'VERIV - EXR Viewer',
			expanded : true,
			document : proxiedDocument,
		});

		this.gui_exposure = this.gui.addBinding(this.params, 'Exposure', {min: -5.0, max: 5.0, step: 0.1}) as SliderInputBindingApi;
		this.gui_exposure.on('change', () => {
			this.gui_exposure.min = Math.min(this.params.Exposure, this.MIN_EXPOSURE);
			this.gui_exposure.max = Math.max(this.params.Exposure, this.MAX_EXPOSURE);
			this.render();
		});
		this.gui_gamma = this.gui.addBinding(this.params, 'Gamma', {min: 0.0, max: 5.0, step: 0.1}).on('change', this.render.bind(this)) as SliderInputBindingApi;
		this.gui_offset = this.gui.addBinding(this.params, 'Offset', {min: -5.0, max: 5.0, step: 0.1}).on('change', this.render.bind(this)) as SliderInputBindingApi;
		this.gui.addBinding( this.params, 'Tonemap', {options: { sRGB: 0, Gamma: 1, '+/-': 2, "False color (0, +∞)": 3, "False color (-∞, +∞):": 4, "False color (+/-)": 5}}).on('change', this.render.bind(this) );
		this.gui.addBinding( this.params, 'Metric', {options: {'Error': 0, 'Abs Error': 1, 'Sqr Error': 2, 'Rel Abs Error': 3, 'Rel Sqr Error': 4}}).on('change', this.render.bind(this) );

		this.reload_button = this.gui.addButton( {title:'Reload image'}).on('click', this.reload_image.bind(this));
		this.gui.addButton({title:'Help & Keybindings'}).on('click', () => { this.toggle_help(); });

		this.settings_gui = this.gui.addFolder({
			title: 'Settings',
			expanded: false,   // optional
		});

		const send_update = () => {
			this.vscode.postMessage({
				command: 'settings',
				settings: this.settings,
			});
			this.render();
		};

		this.settings_gui.addBinding(
			this.settings, 'colormap',
			{ options: { 
				'Turbo': 'turbo', 
				'Viridis': 'viridis',
				'Plasma': 'plasma',
				'Inferno': 'inferno',
				'Magma': 'magma',
			} }
		).on('change', () => {
			const material = this.mesh.material as ShaderMaterial;
			material.uniforms.colorMap.value = get_texture(this.settings.colormap);
			material.needsUpdate = true;
			send_update();
		});
		this.settings_gui.addBinding(
			this.settings, 'interpolation',
			{ options: { 'Nearest': 'nearest', 'Linear': 'linear', } }
		).on('change', send_update);

		const pixel_info_gui = this.gui.addFolder({
			title: 'Pixel info',
			expanded: false,   // optional
		});
		pixel_info_gui.addBinding(
			this.params,
			'PixelCoordinates',
			{
				label: 'Coords',
				format: (v) => {return Math.floor(v);},
				disabled: true,
			}
		);
		pixel_info_gui.addBinding(
			this.params,
			'PixelValues',
			{
				label: 'Values',
				format: format_number_stats,
				disabled: true,
			}
		);

		this.gui_open = true;
		this.help_open = false;
		
		let video_button = this.root.getElementById("video_button")!;
		video_button.addEventListener('click', this.toggle_video.bind(this), { passive: false });
		video_button = this.root.getElementById("video_button-sidebar")!;
		video_button.addEventListener('click', this.toggle_video.bind(this), { passive: false });

		// Setting histogram
		const hist_canvas = this.root.getElementById("histogram-title")! as HTMLCanvasElement;
		hist_canvas.addEventListener('click', (e) => {
			this.histogram_visible = !this.histogram_visible;
			this.hist_window.classList.toggle('tp-rotv-expanded');
		});


		// Setting togging mechanism for the sidebar
		const sidebar_button = this.root.getElementById("toggle-sidebar-sidebar")!;
		sidebar_button.addEventListener('click', () => {
			this.settings.enableSidebar = !this.settings.enableSidebar;
			this.setup_elements_references();
		});
		const list_button = this.root.getElementById("toggle-sidebar-list")!;
		list_button.addEventListener('click', () => {
			this.settings.enableSidebar = !this.settings.enableSidebar;
			this.setup_elements_references();
		});

		// Setting hover mechanism for drag handler
		const delayedHoverElement = this.root.getElementById("dragHandle")!;
		let hoverTimeout: ReturnType<typeof setTimeout>;
		const hoverDelay = 250;
		delayedHoverElement.addEventListener('mouseover', () => {
			hoverTimeout = setTimeout(() => {
				delayedHoverElement.classList.add('hovering');
			}, hoverDelay);
		});

		delayedHoverElement.addEventListener('mouseout', () => {
			clearTimeout(hoverTimeout);
			delayedHoverElement.classList.remove('hovering');
		});
	}

	init_renderer() {
		const status_bar = this.root.getElementById('status-bar')!;
		const sidebar = this.root.getElementById('sidebar')!;

		const window_x = this.window.innerWidth - sidebar.clientWidth;
		const window_y = this.window.innerHeight - status_bar.clientHeight;

		try {
			const canvas_element = this.root.getElementById("renderer")!;
			this.renderer = new WebGLRenderer({canvas: canvas_element});
			this.renderer.setPixelRatio( window.devicePixelRatio );
			this.renderer.setSize( window_x, window_y );

			const canvas_space = this.root.getElementById("canvas-space")!;
			canvas_space.appendChild(this.renderer.domElement);
		} catch (error) {
			this.vscode.postMessage({
				command : 'error',
				text : 'Error creating WebGl context'
			});
			return;
		}

		this.canvasText = this.root.getElementById("renderer2")! as HTMLCanvasElement;
		this.textCtx = this.canvasText.getContext("2d")!;

		this.scene = new Scene();
		this.channel_bar = this.root.getElementById('info-channels-bar')!;

		const aspect = window_x / window_y;
		this.size_canvas = new Vector2(window_x, window_y);

		this.textCtx.canvas.width  = this.size_canvas.x;
		this.textCtx.canvas.height = this.size_canvas.y;
		
		const falseColorTex = get_texture(this.settings.colormap);

		this.camera = new OrthographicCamera( - aspect, aspect, 1, - 1, 0, 1 );

		/*
			Create background
		*/
		const background_material = new ShaderMaterial( {
			uniforms: {
				pixelSize: {value: new Vector2(.25, .25) },
				checkerSize: {value: new Vector2(.25, .25) }
			},
			vertexShader: Shaders.bg_vertex,
			fragmentShader: Shaders.bg_fragment,
		
		} );
		const background_quad = new PlaneGeometry( 100000, 100000 );
		const mesh_bg = new Mesh( background_quad, background_material );
		this.scene.add( mesh_bg );

		/*
			Create image plane
		*/
		const material_bg = new ShaderMaterial( {
			uniforms: {
				image : {value: null},
				hasImage : {value: false},
				imageAlt : {value: null},
				hasImageAlt : {value: false},

				n_channels_img : {value: 0},
				n_channels_ref : {value: 0},

				imageLDR : {value: false},
				imageAltLDR : {value: false},

				exposure : {value: 0.0},
				offset: {value: 0.0},
				gamma: {value: 2.2},

				colorMap : {value: falseColorTex},
				colorMapPosNeg: {value: get_texture('RdBu')},

				min_limit: {value: 0.0},
				max_limit: {value: 1.0},
				normalizeFalseColor: {value: false},

				tonemap: {value: 0},
				metric: {value: 0},

				img_aspect_offset: {value: new Vector2(0.0, 0.0)},
				img_aspect_scaling: {value: new Vector2(1.0, 1.0)},

				imgAlt_aspect_offset: {value: new Vector2(0.0, 0.0)},
				imgAlt_aspect_scaling: {value: new Vector2(1.0, 1.0)},	
			},
			vertexShader: Shaders.img_vertex,
			fragmentShader: Shaders.img_fragment
		
		} );
		material_bg.transparent = true;

		const quad_bg = new PlaneGeometry( 2.0 , 2.0 );	
		this.mesh = new Mesh( quad_bg, material_bg );
		this.scene.add( this.mesh );
		
		/*
			Manages changes in the size of the window
		*/
		const observer = new ResizeObserver(entries => {
			this.window.dispatchEvent(new Event('resize'));
		});
		observer.observe(status_bar);


		window.addEventListener( 'resize', () => {
			const window_x = window.innerWidth - sidebar.clientWidth;
			const window_y = window.innerHeight - status_bar.clientHeight;

			const aspect = window_x / window_y;
			this.size_canvas.x = window_x;
			this.size_canvas.y = window_y;

			const frustumHeight = this.camera.top - this.camera.bottom;

			this.camera.left = - frustumHeight * aspect / 2;
			this.camera.right = frustumHeight * aspect / 2;

			this.camera.updateProjectionMatrix();

			this.renderer.setSize( window_x, window_y);
			this.canvasText.width  = this.size_canvas.x;
			this.canvasText.height = this.size_canvas.y;

			if (this.settings.enableSidebar) {
				const histogram_space = this.root.getElementById("histogram-space-sidebar")!;
				this.hist_canvas.width  = histogram_space.clientWidth;
				this.hist_canvas.height = histogram_space.clientHeight;
			}

			this.render();
		});
	}

	/*
		Render a new view of all the data, assuming changes in the state
	*/
	render() {
		this.render_image();
		this.render_statistics();
		this.render_text();
		this.render_ui();
	}

	/*
		Executes a new render of the state
	*/
	render_image() {
		const [current_image, current_channel] = this.image_manager.get_current_image();
		const [ref_current_image, ref_current_channel] = this.image_manager.get_current_ref_image();
		const uniforms = (this.mesh.material as ShaderMaterial).uniforms;

		const filtering_image = (this.settings.interpolation == "nearest" ? NearestFilter : LinearFilter);

		const change_interpolation = (texture: Texture, new_value: any) => {
			if (texture.minFilter !== new_value) {
				texture.minFilter = new_value;
				texture.needsUpdate = true;
			}
			if (texture.magFilter !== new_value) {
				texture.magFilter = new_value;
				texture.needsUpdate = true;
			}
		};
	
		if (current_image !== null && current_channel !== null) {
			change_interpolation(current_channel.texture, filtering_image);

			uniforms.hasImage.value = true;
			uniforms.image.value = current_channel.texture;
			
			uniforms.n_channels_img.value = current_channel.length;
	
			const size_mod = new Vector2(current_image.width, current_image.height);
			size_mod.divide(this.size_plane);
			size_mod.subVectors(new Vector2(1.0, 1.0), size_mod);
			size_mod.multiplyScalar(0.5);
	
			uniforms.img_aspect_offset.value = size_mod;
			const size_mod_ = size_mod.clone();
			size_mod_.multiplyScalar(2.0);
			size_mod_.subVectors(new Vector2(1.0, 1.0), size_mod_);
			uniforms.img_aspect_scaling.value = size_mod_;
			uniforms.imageLDR.value = current_image.ldr;
		} else {
			uniforms.hasImage.value = false;
		}
	
		if (ref_current_image !== null && ref_current_channel !== null && current_image !== null && this.image_manager.active_ref_different()) {
			change_interpolation(ref_current_channel.texture, filtering_image);

			uniforms.hasImageAlt.value = true;
			uniforms.imageAlt.value = ref_current_channel.texture;

			uniforms.n_channels_ref.value = ref_current_channel.length;
	
			const size_mod2 = new Vector2(ref_current_image.width, ref_current_image.height);
			size_mod2.divide(this.size_plane);
			size_mod2.subVectors(new Vector2(1.0, 1.0), size_mod2);
			size_mod2.multiplyScalar(0.5);
	
			uniforms.imgAlt_aspect_offset.value = size_mod2;
			const size_mod2_ = size_mod2.clone();
			size_mod2_.multiplyScalar(2.0);
			size_mod2_.subVectors(new Vector2(1.0, 1.0), size_mod2_);
			uniforms.imgAlt_aspect_scaling.value = size_mod2_;
			uniforms.imageAltLDR.value = ref_current_image.ldr;
		} else {
			uniforms.hasImageAlt.value = false;
		}
	
		uniforms.exposure.value = this.params.Exposure;
		uniforms.offset.value = this.params.Offset;
		uniforms.gamma.value = this.params.Gamma;
	
		uniforms.tonemap.value = this.params.Tonemap;
		uniforms.metric.value = this.params.Metric;

		// Fill the limits if the user requested and available
		if (current_image !== null && this.params.NormalizeFalseColor) {
			const limits = this.image_manager.get_limits(this.params.Metric);
			if (limits.min_limit !== null && limits.max_limit !== null) {
				uniforms.min_limit.value = limits.min_limit;
				uniforms.max_limit.value = limits.max_limit;
				uniforms.normalizeFalseColor.value = true;

				this.params.NormalizeInfo.x = limits.min_limit;
				this.params.NormalizeInfo.y = limits.max_limit;
			} else {
				uniforms.normalizeFalseColor.value = false;
				this.params.NormalizeInfo.x = 0.0;
				this.params.NormalizeInfo.y = 0.0;
			}
		} else {
			uniforms.normalizeFalseColor.value = false;
			this.params.NormalizeInfo.x = 0.0;
			this.params.NormalizeInfo.y = 0.0;
		}
	
		let title = "";
		if (current_image != null) {
			title += ` (${current_image.width}, ${current_image.height})`;
		}
		const scale_gui = this.mesh.scale.x / this.scale_ref * 100;
		title += ` [${scale_gui.toFixed(0)}%]`;
		this.gui.title = title;
	
		this.renderer.render( this.scene, this.camera );
	}

	render_text() {
		const get_pixel_coordinates = (x: number, y: number, ch: number, oddX: boolean, oddY: boolean, n_channels: number) => {
			let offset_ch = ch * 0.18 + 0.25 + (4 - n_channels) * 0.18 / 2.0;

			offset_ch -= (oddY ? (0.25 / 2.0) - (0.25 / 3.0) : 0.0);

			const offset_x = 0.5 - (oddX ? (0.25 / 2.0) - (0.25 / 3.0) : 0.0);
			const vec = new Vector3(
				((x + offset_x) / this.size_plane.x) * 2.0 - 1.0,
				((y + offset_ch) / this.size_plane.y) * 2.0 - 1.0,
				0.0
			);
			const pos = this.mesh.position.clone();
			pos.y = -pos.y;
			const scale = this.mesh.scale.clone();
			const m4 = new Matrix4().compose(pos, new Quaternion(), scale);
	
			vec.applyMatrix4(m4);
			return vec.project(this.camera);
		};

		const get_pixel_coordinates_inverse = (vec: Vector3, ch: number, oddX: boolean, oddY: boolean, n_channels: number) => {
			const pos = this.mesh.position.clone();
			pos.y = -pos.y;
			const scale = this.mesh.scale.clone();
			const m4 = new Matrix4().compose(pos, new Quaternion(), scale).invert();

			const unprojectedVec = vec.clone().unproject(this.camera).applyMatrix4(m4);

			// const offset_ch = ch * 0.25 + 0.25 - (oddY ? (0.25 / 2.0) - (0.25 / 3.0) : 0.0);
			const offset_ch = ch * 0.18 + 0.25 + (4 - n_channels) * 0.18 / 2.0 - (oddY ? (0.25 / 2.0) - (0.25 / 3.0) : 0.0);
			const offset_x = 0.5 - (oddX ? (0.25 / 2.0) - (0.25 / 3.0) : 0.0);

			const x = ((unprojectedVec.x + 1.0) / 2.0) * this.size_plane.x - offset_x;
			const y = ((unprojectedVec.y + 1.0) / 2.0) * this.size_plane.y - offset_ch;

			return { x: x, y: y };
		};
		
		const format_number = (number: number) => {
			const digits = Math.max(Math.floor(Math.log10(Math.abs(number))), 0) + 1;
			if (digits >= 4) {
				return number.toExponential(2);
			} else {
				return number.toFixed(4);
			}
		};

		const clip_value = (value: number, min: number, max: number) => {
			return Math.max(min, Math.min(max, value));
		};

		const [current_image, current_channel] = this.image_manager.get_current_image();
		const [current_ref, current_ref_channel] = this.image_manager.get_current_ref_image();
		const n_channels = current_channel !== null ? current_channel.length : 0;

		// Compute pixel size in pixels in the canvas
		const pixel_min = get_pixel_coordinates(0, 0, 0, false, false, 4).x * 0.5 + 0.5;
		const pixel_max = get_pixel_coordinates(1, 0, 0, false, false, 4).x * 0.5 + 0.5;
		const pixel_size = (pixel_max - pixel_min) * this.size_canvas.x;
		const font_size = Math.ceil(pixel_size / 8);

		const alpha_interpolation = (pixel_size: number, min_size: number, max_size: number) => {
			if (pixel_size >= max_size) {
				return 1.0;
			} else if (pixel_size <= min_size) {
				return 0.0;
			} else {
				return (pixel_size - min_size) / (max_size - min_size);
			}
		};

		const alpha = alpha_interpolation(pixel_size, this.size_canvas.x / 30, this.size_canvas.x / 15);

		// Early exit for non valid cases or unnecessary operations
		if (
			current_image === null || current_channel === null || isNaN(alpha) || alpha <= 0.0
		) {
			this.textCtx.clearRect(0, 0, this.textCtx.canvas.width, this.textCtx.canvas.height);
			return;
		}
	
		this.textCtx.canvas.width  = this.size_canvas.x;
		this.textCtx.canvas.height = this.size_canvas.y;
		this.textCtx.font = `${font_size}px monospace`;
		this.textCtx.textAlign = "center";
		this.textCtx.textBaseline = "middle";
	
		this.textCtx.shadowColor = `rgba(0, 0, 0, ${alpha})`;
		this.textCtx.shadowOffsetX = 0;
		this.textCtx.shadowOffsetY = 0;
		this.textCtx.shadowBlur = 5;
	
		this.textCtx.clearRect(0, 0, this.textCtx.canvas.width, this.textCtx.canvas.height);

		const size_x = current_image.width;
		const size_y = current_image.height;
		// const norm_factor = current_image.max_value;

		// TODO : finish normalization
		const norm_factor = new Vector3(1.0);

		let offset_x = this.size_plane.x - size_x;
		if ((current_image.width % 2) > 0 ) {
			offset_x -= 1;
			offset_x /= 2;
			offset_x += 0.5;
		}else {
			offset_x /= 2;
		}

		let offset_y = this.size_plane.y - size_y;
		if ((current_image.height % 2) > 0 ) {
			offset_y -= 1;
			offset_y /= 2;
			offset_y += 0.5;
		} else {
			offset_y /= 2;
		}
	
		const oddX = (size_x % 2) > 0;
		const oddY = (size_y % 2) > 0;

		/*
			Compute bounds for drawing the pixel values
		 */
		const offset_ndc = 0.1;
		const ndc_min = new Vector3(-1.0 - offset_ndc, -1.0 - offset_ndc, 0.0);
		const v_min = get_pixel_coordinates_inverse(ndc_min, 0, oddX, oddY, n_channels);
		let min_x = clip_value(v_min.x - offset_x, 0, size_x);
		let min_y = clip_value(v_min.y - offset_y, 0, size_y);
		const ndc_max = new Vector3(1.0 + offset_ndc, 1.0 + offset_ndc, 0.0);
		const v_max = get_pixel_coordinates_inverse(ndc_max, 0, oddX, oddY, n_channels);
		let max_x = clip_value(v_max.x - offset_x, 0, size_x);
		let max_y = clip_value(v_max.y - offset_y, 0, size_y);

		min_x = Math.floor(min_x);
		min_y = Math.floor(min_y);
		max_x = Math.ceil(max_x);
		max_y = Math.ceil(max_y);

		let vector = new Vector3(0,0,0);
		for (let j=min_y; j<max_y; j++) {
			for (let i=min_x; i<max_x; i++) {
				for (let ch=0; ch<n_channels; ch++) {
					vector = get_pixel_coordinates(i + offset_x, j + offset_y, ch, oddX, oddY, n_channels);
					
					const pix_x = (vector.x + 1.0) / 2.0 * this.size_canvas.x;
					const pix_y = (vector.y + 1.0) / 2.0 * this.size_canvas.y;
					if (ch == 0) {
						this.textCtx.fillStyle = `rgba(255, 0, 0, ${alpha})`;
					} else if (ch == 1) {
						this.textCtx.fillStyle = `rgba(0, 255, 0, ${alpha})`;
					} else if (ch == 2) {
						this.textCtx.fillStyle = `rgba(0, 0, 255, ${alpha})`;
					} else if (ch == 3) {
						this.textCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
					}
					let data_pixel = get_pixel_data(i, j, ch, current_image, current_channel.data, current_channel.length);
					data_pixel = (this.params.Normalize ? data_pixel/norm_factor.getComponent(ch) : data_pixel);
					if (current_ref === null || current_ref_channel === null) {
						this.textCtx.fillText(format_number(data_pixel), pix_x, pix_y);
					} else {
						if (
							current_image.width == current_ref.width &&
							current_image.height == current_ref.height
						) {
							// const norm_factor_ref = current_ref.max_value;
							
							// TODO : finish normalization
							const norm_factor_ref = new Vector3(1.0);
							let data_ref = get_pixel_data(i, j, ch, current_ref, current_ref_channel.data, current_ref_channel.length);
							data_ref = (this.params.Normalize ? data_ref/norm_factor_ref.getComponent(ch) : data_ref);
							const error_pixel = compute_metric(this.params.Metric, data_pixel, data_ref);
							this.textCtx.fillText(format_number(error_pixel), pix_x, pix_y);
						} else {
							this.textCtx.fillText("  -  ", pix_x, pix_y);	
						}
					}
				}
			}
		}
	}

	render_statistics() {	
		const canvas = this.hist_canvas.getContext("2d")!;
		canvas.clearRect(0, 0, this.hist_canvas.width, this.hist_canvas.height);
		canvas.globalCompositeOperation = "source-over";

		// Query statistics. In case they do not exists, launch the process
		const statistics = this.image_manager.get_statistics(this.params.Metric);

		if (statistics === null || !statistics.finished) {
			this.hist_min.innerText = "-";
			this.hist_mean.innerText = "-";
			this.hist_max.innerText = "-";

			if (statistics !== null && !statistics.finished) {
				canvas.font = "30px monospace";
				canvas.textAlign = "center";
				canvas.textBaseline = "middle";
				canvas.fillStyle = "gray";
				canvas.fillText("Loading", this.hist_canvas.width/2, this.hist_canvas.height/2);
			}
			return;
		}

		this.hist_min.innerText = format_number_stats(statistics.min_value);
		this.hist_mean.innerText = format_number_stats(statistics.mean_value);
		this.hist_max.innerText = format_number_stats(statistics.max_value);

		/*
			Draw the logarithmic points for giving a sense of scale
		 */
		const generateSymmetricLogTicks = (min: number, max: number, base = 10) => {
			const ticks = [];

			// Determine bounds in absolute terms
			const absMin = Math.max(Math.min(Math.abs(min), Math.abs(max)), Number.EPSILON);
			const absMax = Math.max(Math.abs(min), Math.abs(max));

			const minExp = Math.ceil(Math.log10(absMin));
			const maxExp = Math.floor(Math.log10(absMax));

			// Generate negative ticks (in decreasing order)
			for (let exp = maxExp; exp >= minExp; exp--) {
				const value = Math.pow(base, exp);
				if (-value >= min) ticks.push(-value);
			}

			// Add zero if it's within the range
			if (min <= 0 && max >= 0) {
				ticks.push(0);
			}

			// Generate positive ticks (in increasing order)
			for (let exp = minExp; exp <= maxExp; exp++) {
				const value = Math.pow(base, exp);
				if (value <= max) ticks.push(value);
			}

			return ticks;
		};

		const x_ticks = generateSymmetricLogTicks(statistics.min_value, statistics.max_value);
		const y_ticks = [0.0, 0.25, 0.5, 0.75, 1.0];

		x_ticks.forEach((tick, i) => {
			const pos = val2pos(tick, statistics.min_value, statistics.max_value);
			const x = pos * this.hist_canvas.width;
			canvas.beginPath();
			canvas.strokeStyle = '#333'; // darker color for first tick
			canvas.lineWidth = 1;             // thicker line for first tick
			canvas.moveTo(x, 0);
			canvas.lineTo(x, this.hist_canvas.height);
			canvas.stroke();
			canvas.beginPath();
			canvas.strokeStyle = '#555';
			canvas.lineWidth = 2;
			canvas.moveTo(x, this.hist_canvas.height);
			canvas.lineTo(x, this.hist_canvas.height * (1 - 0.1));
			canvas.stroke();
		});

		y_ticks.forEach((tick, i) => {
			const y = (1.0 - tick) * this.hist_canvas.height;
			const factor = this.hist_canvas.height / this.hist_canvas.width;

			canvas.beginPath();
			canvas.strokeStyle = '#333';
			canvas.lineWidth = 1;
			canvas.moveTo(0, y);
			canvas.lineTo(this.hist_canvas.width, y);
			canvas.stroke();
			canvas.beginPath();
			canvas.strokeStyle = '#555';
			canvas.lineWidth = 2;
			canvas.moveTo(0, y);
			canvas.lineTo(0.1 * this.hist_canvas.width * factor, y);
			canvas.stroke();
		});

		canvas.globalCompositeOperation = "lighter";

		const [current_image, current_channel] = this.image_manager.get_current_image();

		const get_color = (ch: number, alpha: number) => {
			// Mono channel always white
			if (current_channel !== null && current_channel.length == 1) {
				return `rgba(255, 255, 255, ${alpha})`;
			}

			let color = `rgba(255, 0, 0, ${alpha})`;
			if (ch == 1) {
				color = `rgba(0, 255, 0, ${alpha})`;
			} else if (ch == 2) {
				color = `rgba(0, 0, 255, ${alpha})`;
			}
			return color;
		};

		let n_channels = (current_channel !== null ? current_channel.length : 0);
		n_channels = Math.min(n_channels, 3);

		for(let ch=0; ch<n_channels; ch++) {			

			/*
				First draw a polygon with the filled color
			*/
			canvas.beginPath();
			canvas.fillStyle = get_color(ch, 0.4);
			canvas.moveTo(0, (1.0 - statistics.histogram[0 + this.N_BINS_HIST * ch]) * this.hist_canvas.height);
			for(let i=1; i<this.N_BINS_HIST; i++) {
				canvas.lineTo(
					(i / this.N_BINS_HIST) * this.hist_canvas.width,
					(1.0 - statistics.histogram[i + this.N_BINS_HIST * ch]) * this.hist_canvas.height
				);
			}
			canvas.lineTo((this.N_BINS_HIST - 1) / this.N_BINS_HIST * this.hist_canvas.width, this.hist_canvas.height);
			canvas.lineTo(0, this.hist_canvas.height);
			canvas.closePath();
			canvas.fill();

			/*
				Second draw a solid line representing the maximum values of the histogram
			*/
			canvas.beginPath();
			canvas.strokeStyle = get_color(ch, 0.8);
			canvas.lineWidth = 2.0;
			canvas.moveTo(0, (1.0 - statistics.histogram[0 + this.N_BINS_HIST * ch]) * this.hist_canvas.height);
			for(let i=1; i<this.N_BINS_HIST; i++) {
				canvas.lineTo(
					(i / this.N_BINS_HIST) * this.hist_canvas.width,
					(1.0 - statistics.histogram[i + this.N_BINS_HIST * ch]) * this.hist_canvas.height
				);
			}
			canvas.stroke();
		}
	}

	render_ui() {

		if (this.params.Tonemap >= 3) {
			if (this.normalization_gui == null) {
				this.normalization_gui = this.gui.addBinding( this.params, 'NormalizeFalseColor', {
					label: 'Normalize false color',
					index: 4,
				}).on('change', this.render.bind(this) );
			}

			if (this.params.NormalizeFalseColor && this.normalization_info === null) {
				this.normalization_info = this.gui.addBinding( this.params, 'NormalizeInfo', {
					label: 'Normalization info',
					index: 5,
					format: (v) => v.toFixed(3),
				});
			}

			if (!this.params.NormalizeFalseColor && this.normalization_info !== null) {
				this.gui.remove(this.normalization_info);
				this.normalization_info = null;
			}
		} else {
			if (this.normalization_gui !== null) {
				this.gui.remove(this.normalization_gui);
				this.normalization_gui = null;
			}
			if (this.normalization_info !== null) {
				this.gui.remove(this.normalization_info);
				this.normalization_info = null;
			}
		}


		// Reset the HTML
		while (this.info_bar.firstChild) {
			this.info_bar.removeChild(this.info_bar.firstChild);
		}
		while (this.channel_bar.firstChild) {
			this.channel_bar.removeChild(this.channel_bar.firstChild);
		}

		const active_index = this.image_manager.get_index_active();
		const ref_index = this.image_manager.get_index_ref();

		function shorten_filename(filename: string, maxLength = 25): string {
			const extensionIndex = filename.lastIndexOf('.');
			const baseName = extensionIndex !== -1 ? filename.substring(0, extensionIndex) : filename;
			const extension = extensionIndex !== -1 ? filename.substring(extensionIndex) : '';

			if (filename.length <= maxLength) {
				return filename;
			}

			const shortenedBase = baseName.substring(0, maxLength - extension.length - 3 - 4) + '...';
			const shortenedEnd = baseName.substring(baseName.length - 4);
			return `${shortenedBase}${shortenedEnd}${extension}`;
		}

		// Not super efficient - would be better to only update the changed elements
		this.image_manager.for_each_image((image_data: Types.ImageData, index: number) => {
			// Add image element to the list
			const new_button = document.createElement('div');
			new_button.id = index.toString();
			new_button.className = 'img-button';
			if (index === active_index) {
				new_button.className += " active";
			}
			if (index === ref_index) {
				new_button.className += " ref";
			}
			new_button.setAttribute('oncontextmenu', "event.preventDefault();");
			
			const image_name = document.createElement('span');
			image_name.className = 'img-button-name';
			const path = decodeURIComponent(image_data.path);
			image_name.innerText = (index+1).toString() + ". ";
			if (this.settings.enableSidebar) {
				image_name.innerText += path.replace(/^.*[\\\/]/, '');
			} else {
				image_name.innerText += shorten_filename(path.replace(/^.*[\\\/]/, ''));
			}
			image_name.id = index.toString();
			image_name.setAttribute('oncontextmenu', "event.preventDefault();");
			new_button.appendChild(image_name);
			
			const close_btn = document.createElement('span');
			close_btn.innerText = "✖";
			close_btn.id = index.toString();
			close_btn.className = 'close-tag';
			new_button.appendChild(close_btn);
			
			new_button.addEventListener(
				'mousedown',
				(e: MouseEvent) => { this.select_interaction(e, false); },
				{ passive: false }
			);
			this.info_bar.appendChild(new_button);
		});

		const current_index = this.image_manager.get_index_active();
		if (this.focus_img_button && current_index !== -1) {
			this.root.getElementById(current_index.toString())!.scrollIntoView(
				{}
			);
			this.focus_img_button = false;
		}

		/*
			Process the channels
		 */
		const [current_image, _] = this.image_manager.get_current_image();
		if (current_image === null) {
			return;
		}
		const n_channel_groups = current_image.channel_groups.length;
		if (n_channel_groups < 2) {
			return; // Avoid drawing the bar for images with only one channel
		}

		for (let ch_index=0; ch_index<n_channel_groups; ch_index++) {
			const new_button = document.createElement('div');
			new_button.id = ch_index.toString();
			new_button.className = 'img-button';
			if (ch_index === this.image_manager.get_channel_group_active()) {
				new_button.className += " active";
			}
			new_button.setAttribute('oncontextmenu', "event.preventDefault();");

			const image_name = document.createElement('span');
			const path = decodeURIComponent(current_image.channel_groups[ch_index].name);
			image_name.innerText = (ch_index+1).toString() + ". ";
			image_name.innerText += shorten_filename(path.replace(/^.*[\\\/]/, ''));
			image_name.id = ch_index.toString();
			image_name.setAttribute('oncontextmenu', "event.preventDefault();");
			new_button.appendChild(image_name);

			new_button.addEventListener(
				'mousedown',
				(e: MouseEvent) => { this.select_interaction(e, true); },
				{ passive: false }
			);
			this.channel_bar.appendChild(new_button);
		}
	}

	load_image(image_paths: string[], reload_id: number) {
		const image_path = image_paths.shift()!;

		const error_callback = (error: any) => {
			const type_operation = (reload_id === -1 ? 'load' : 'reload');
			this.vscode.postMessage({
				command : 'error',
				text : `Error ${type_operation} image "` + image_path.replace(/^.*[\\\/]/, '') + '"\n' + error,
			});
		};

		const success_callback = (should_advance: boolean) => {
			// Adjust the size of the image plane
			const max_dim = this.image_manager.get_max_dims();
			this.size_plane = new Vector2(max_dim, max_dim);

			if (!this.expanded_to_sidebar && !this.settings.enableSidebar && this.image_manager.size() > 5) {
				this.expanded_to_sidebar = true;
				this.settings.enableSidebar = true;
				this.setup_elements_references();
			}

			// Update GUI
			this.focus_img_button = true;
			this.fit_image();
			this.render();

			if (should_advance && image_paths.length > 0) {
				this.load_image(image_paths, reload_id);
			} else {
				this.root.querySelector('body')!.focus();
			}
		};

		this.image_manager.load_image(image_path, reload_id, success_callback, error_callback);
	}

	reload_image() {
		const [current_image, current_channel] = this.image_manager.get_current_image();
		if (current_image !== null && current_channel !== null) {
			if (current_image.animated) {
				this.vscode.postMessage({
					command: 'warning',
					text: 'Cannot reload animated images.'
				});
			} else {
				this.load_image([current_image.path], this.image_manager.get_index_active());
			}
		}
	}

	reload_all_images() {
		let warning_message = false;
		this.image_manager.for_each_image((image_data: Types.ImageData, index: number) => {
			if (image_data.animated) {
				warning_message = true;
			} else {
				this.load_image([image_data.path], index);
			}
		});
		// Show warning message one time to the user
		if (warning_message) {
			this.vscode.postMessage({
				command: 'warning',
				text: 'Cannot reload animated images.'
			});
		}
	}

	remove_image(index: number) {
		this.image_manager.remove_image(index);

		// Adjust the size of the image plane
		const max_dim = this.image_manager.get_max_dims();
		this.size_plane = new Vector2(max_dim, max_dim);
	}

	fit_image() {
		if (!this.image_manager.valid_image()) {
			return;
		}

		const [current_image, current_channel] = this.image_manager.get_current_image();
		if (current_image === null || current_channel === null) {
			return;
		}

		const factor_canvas = this.size_canvas.x / this.size_canvas.y;

		const factor_img = current_image.width / current_image.height;
		const factor_aspect = factor_img / factor_canvas;
	
		const factor = 1.05 * (factor_aspect > 1 ? factor_aspect : 1.0);
		const a_width = current_image.width;
		const a_heigth = current_image.height;
		const adapted = Math.min(a_width/this.size_plane.x , a_heigth/this.size_plane.y);
		this.mesh.scale.set(1.0/(adapted * factor), 1.0/(adapted * factor), 1.0);
		this.mesh.position.set(0.0, 0.0, 0.0);
		this.mesh.updateMatrix();
	
		this.scale_ref = this.mesh.scale.clone().x;
	}


	// =================================================================================

	/* 
		Functions that manage the state through callbacks
	*/
	toggle_video() {
		if (this.video_playing) {
			window.clearInterval(this.timer);
			this.video_playing = !this.video_playing;
			this.video_button.innerText = "▶";
		} else {
			if (this.input_element.value !== "") {
				const fps_data = parseFloat(this.input_element.value);
				if (fps_data > 0.0) { 
					this.timer = window.setInterval(() => {
						this.image_manager.shift_image(1);
						this.focus_img_button = true;
						this.render();
					}, 1.0/fps_data*1000);
					this.video_playing = !this.video_playing;
				}
				this.video_button.innerText = "⏸︎";
			}
		}
	}

	/*
		Show and hides the modal with the help
	*/
	toggle_help() {
		if (!this.help_open) {
			// Disable previous input events
			this.setup_key_controls(false);
			
			const modal_elem = this.root.getElementById("modal_help")!;
			modal_elem.style.visibility = 'visible';
			modal_elem.style.opacity = '1';
			this.help_open = true;
			this.gui.hidden = true;
			
			if (!this.settings.enableSidebar) {
				this.hist_window.style.display = 'none';
			}
			
			const body_element = this.root.querySelector('body')!;
			body_element.addEventListener('keydown', this.function_bindings['close_key']);
		} else {
			const modal_elem = this.root.getElementById("modal_help")!;
			modal_elem.style.visibility = 'hidden';
			modal_elem.style.opacity = '0';
			this.help_open = false;
			this.gui.hidden = false;

			const body_element = this.root.querySelector('body')!;
			body_element.removeEventListener('keydown', this.function_bindings['close_key']);

			// Re-enable input events
			this.setup_key_controls(true);
		
			if (!this.settings.enableSidebar) {
				this.hist_window.style.display = '';
			}
		}
	}

	/*
		Handle key events
	*/
	key_input(e: KeyboardEvent) {
		// Ignore this event if the target is a input element and we are not pressing space
		if (e.target && (e.target as HTMLElement).tagName === 'INPUT') {
			if (e.key === ' ') {
				e.preventDefault();
				e.stopPropagation();
			} else {
				return;
			}
		}
		
		switch (e.key) {
			case 'e':
				this.params.Exposure += 0.5;
				this.gui_exposure.max = Math.max(this.params.Exposure, this.MAX_EXPOSURE);
				this.gui_exposure.refresh();
				break;
			case 'E':
				this.params.Exposure -= 0.5;
				this.gui_exposure.min = Math.min(this.params.Exposure, this.MIN_EXPOSURE);
				this.gui_exposure.refresh();
				break;
			case 'q':
				if (this.image_manager.valid_image()) {
					this.remove_image(-1);
				}
				break;
			case 'Q':
				this.image_manager.clean_cache();
				break;
			case 'R':
			case 'r':
				this.params.Exposure = 0.0;
				this.gui_exposure.min = this.MIN_EXPOSURE;
				this.gui_exposure.max = this.MAX_EXPOSURE;
				this.params.Gamma = 2.2;
				this.params.Offset = 0.0;
				this.gui_exposure.refresh();
				this.gui_gamma.refresh();
				this.gui_offset.refresh();
				this.fit_image();
				break;
			case 'T':
			case 't':
				this.gui.expanded = !this.gui.expanded;
				this.gui_open = this.gui.expanded;
				break;
			case 'S':
			case 's': {
				if (e.ctrlKey || e.metaKey) {
					const [current_image, current_channel] = this.image_manager.get_current_image();
					if (current_image !== null && current_channel !== null) {
						// Present spinner in the UI
						this.spinner.style.display = '';
						const material = this.mesh.material as ShaderMaterial;						
						this.image_saver.prepare(material, current_image.width, current_image.height);

						const fileName = current_image.path.replace(/^.*[\\\/]/, '');
						const fileNameNoExt = fileName.replace(/\.[^/.]+$/, "");
						this.image_saver.save_to_file(decodeURIComponent(fileNameNoExt + '.png'));
						return;
					}
				} else {
					this.settings.enableSidebar = !this.settings.enableSidebar;
					this.setup_elements_references();
				}
				break;
			}
			case 'D':
			case 'd': {
				if (!this.settings.enableSidebar) {
					this.hist_window.classList.toggle('tp-rotv-expanded');
					this.histogram_visible = !this.histogram_visible;
				}
				break;
			}
			case 'F':
			case 'f':
				this.fit_image();
				break;
			case 'H':
			case 'h':
			case '?':
				this.toggle_help();
				break;
			case 'L':
			case 'l': {
				this.reload_image();
				break;
			}
			case 'ArrowUp':
			case 'ArrowLeft':
				if (e.shiftKey) {
					this.image_manager.shift_channel_group(-1);
				} else {
					this.image_manager.shift_image(-1);
				}
				this.focus_img_button = true;
				break;
			case 'ArrowDown':
			case 'ArrowRight':
				if (e.shiftKey) {
					this.image_manager.shift_channel_group(1);
				} else {
					this.image_manager.shift_image(1);
				}
				this.focus_img_button = true;
				break;
			case 'Tab':
				if (!e.shiftKey) {
					this.image_manager.shift_image(1);
				} else {
					this.image_manager.shift_image(-1);
				}
				this.focus_img_button = true;
				e.preventDefault();
				e.stopPropagation();	
				break;
			case ' ':
				this.toggle_video();
				break;
			case 'c':
			case 'C':
				if (e.ctrlKey || e.metaKey) {
					const [current_image, current_channel] = this.image_manager.get_current_image();
					if (current_image !== null && current_channel !== null) {
						this.spinner.style.display = '';
						const material = this.mesh.material as ShaderMaterial;
						this.image_saver.prepare(material, current_image.width, current_image.height);
						this.image_saver.copy_to_clipboard();

						this.root.querySelector('body')!.focus();

						return;
					}
				}
				break;
		}
	
		/*
			Allow user to select with the numbers the image or reference
		*/
		let number_key_pressed = null;
		if (e.code.startsWith('Digit')) {
			number_key_pressed = parseInt(e.code.substring(5), 10);
		}

		if (number_key_pressed !== null && number_key_pressed >= 0 && number_key_pressed <= 9) {
			if (number_key_pressed == 0) {
				number_key_pressed = 10;
			}
			number_key_pressed -= 1;
			this.image_manager.select_image(number_key_pressed, e.shiftKey);
			this.focus_img_button = true;
		}
		
		// Update the gui
		this.render();
	}

	wheel_input(e : WheelEvent) {
		const target = e.target ? (e.target as HTMLElement).id : '';
		if (target !== "renderer2") {
			return true;
		}
	
		const canvas_element = this.root.getElementById("renderer")!;
		let factor = this.SCROLL_FACTOR;
		if (e.deltaY < 0) {
			factor = 1/factor;
		}
	
		const newScale = this.mesh.scale.clone();
		newScale.multiplyScalar(factor);
		this.mesh.scale.set( newScale.x, newScale.y, newScale.z );
	
		const cursor_pos = new Vector3();
		cursor_pos.set(
			(e.offsetX / canvas_element.clientWidth) * 2 - 1,
			- (e.offsetY / canvas_element.clientHeight) * 2 + 1,
			0
		);
		const newPos = this.mesh.position.clone();
		const normalizedPos = newPos.clone().project(this.camera);
	
		const offset = new Vector3(
			(cursor_pos.x - normalizedPos.x) * (factor - 1.0),
			(cursor_pos.y - normalizedPos.y) * (factor - 1.0),
			0.0
		);
		offset.unproject(this.camera);
		this.mesh.position.set( newPos.x - offset.x, newPos.y - offset.y, newPos.z );
	
		this.mesh.updateMatrix();
	
		e.preventDefault();
		e.stopPropagation();
	
		this.render();
		return true;
	}

	pointerdown(e: PointerEvent) {
		const canvas_element = this.root.getElementById("renderer")!;
		this.startX = e.offsetX;
		this.startY = e.offsetY;
		this.position_start = this.mesh.position.clone();
		this.drag = true;
		canvas_element.style.cursor = 'grab';
		document.body.style.userSelect = 'none';

		this.startX = (e.offsetX / canvas_element.clientWidth) * 2.0 - 1.0;
		this.startY = -(e.offsetY / canvas_element.clientHeight) * 2.0 + 1.0;

		return true;
	}

	pointerup(e: PointerEvent) {
		const canvas_element = this.root.getElementById("renderer")!;
		this.drag = false;
		canvas_element.style.cursor = 'auto';
		document.body.style.userSelect = '';
		return true;
	}

	pointermove(e: PointerEvent) {
		const canvas_element = this.root.getElementById("renderer")!;
		if (this.drag) {
			const cursor_pos = new Vector3();
			cursor_pos.set(
				(e.offsetX / canvas_element.clientWidth) * 2 - 1,
				- (e.offsetY / canvas_element.clientHeight) * 2 + 1,
				0.0
			);
			const previous_pos = new Vector3(
				this.startX,
				this.startY,
				0.0
			);
			cursor_pos.sub(previous_pos);
			cursor_pos.unproject(this.camera);
			cursor_pos.z = 0.0;

			const newPos = this.position_start.clone();
			newPos.add(cursor_pos);
			this.mesh.position.set( newPos.x, newPos.y, newPos.z );
			this.mesh.updateMatrix();
			this.render();
		}
		return true;
	}

	select_interaction(e: MouseEvent, is_channel: boolean) {
		const html_element = (e.target as HTMLElement);
		const id_elem = html_element ? parseInt(html_element.id) : -1;

		if (html_element.classList.contains('close-tag')) {
			this.remove_image(id_elem);
		} else if (!is_channel) {
			if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
				this.image_manager.select_image(id_elem, true);
			} else if (e.button === 0) {
				this.image_manager.select_image(id_elem, false);
			}
		} else if (is_channel) {
			if (e.button === 0) {
				this.image_manager.select_channel_group(id_elem);
			}
		}

		e.preventDefault();
		e.stopPropagation();
		this.render();
		return false;
	}

	close_key (e: KeyboardEvent) {
		switch (e.key) {
			case 'Escape':
				this.toggle_help();
				break;
			case 'h':
			case '?':
				this.toggle_help();
				break;
		}
	}


	canvas_mouse_move (e: MouseEvent) {
		const get_pixel_coordinates_inverse = (vec: Vector3, ch: number, oddX: boolean, oddY: boolean, n_channels: number) => {
			const pos = this.mesh.position.clone();
			pos.y = -pos.y;
			const scale = this.mesh.scale.clone();
			const m4 = new Matrix4().compose(pos, new Quaternion(), scale).invert();

			const unprojectedVec = vec.clone().unproject(this.camera).applyMatrix4(m4);

			const offset_ch = ch * 0.18 + 0.25 + (4 - n_channels) * 0.18 / 2.0 - (oddY ? (0.25 / 2.0) - (0.25 / 3.0) : 0.0);
			const offset_x = 0.5 - (oddX ? (0.25 / 2.0) - (0.25 / 3.0) : 0.0);

			const x = ((unprojectedVec.x + 1.0) / 2.0) * this.size_plane.x - offset_x;
			const y = ((unprojectedVec.y + 1.0) / 2.0) * this.size_plane.y - offset_ch;

			return { x: x, y: y };
		};

		const [current_image, current_channel] = this.image_manager.get_current_image();
		if (current_image === null || current_channel === null) {
			this.canvas_mouse_leave(null);
			return;
		}

		const oddX = (current_image.width % 2) > 0;
		const oddY = (current_image.height % 2) > 0;

		const startX = e.offsetX;
		const startY = this.size_canvas.y - e.offsetY;

		const ndc_x = (startX / this.size_canvas.x) * 2 - 1;
		const ndc_y = -(startY / this.size_canvas.y) * 2 + 1;
		const ndc = new Vector3(ndc_x, ndc_y, 0.0);
		const inv_ndc = get_pixel_coordinates_inverse(ndc, 0, oddX, oddY, 1);

		const size_x = current_image.width;
		const size_y = current_image.height;

		// TODO : finish normalization
		const norm_factor = new Vector3(1.0);
		
		let offset_x = this.size_plane.x - size_x;
		if ((current_image.width % 2) > 0 ) {
			offset_x -= 1;
			offset_x /= 2;
			offset_x += 0.5;
		}else {
			offset_x /= 2;
		}

		let offset_y = this.size_plane.y - size_y;
		if ((current_image.height % 2) > 0 ) {
			offset_y -= 1;
			offset_y /= 2;
			offset_y += 0.5;
		} else {
			offset_y /= 2;
		}

		const pixel_x = Math.round(inv_ndc.x - offset_x);
		const pixel_y = Math.round(inv_ndc.y - offset_y);

		if (pixel_x >= size_x || pixel_x < 0 ||
			pixel_y >= size_y || pixel_y < 0) {
			this.canvas_mouse_leave(null);
			return;
		}

		let n_channels = current_channel.length;
		n_channels = Math.min(n_channels, 3);

		const pixel_values = [0,0,0];
		const [ref_image, ref_channel] = this.image_manager.get_current_ref_image();

		for (let ch=0; ch<n_channels; ch++) {
			let val = get_pixel_data(pixel_x, pixel_y, ch, current_image, current_channel.data, current_channel.length);
			if (ref_image != null && ref_channel !== null) {
				const ref_val = get_pixel_data(pixel_x, pixel_y, ch, ref_image, ref_channel.data, ref_channel.length);
				val = compute_metric(this.params.Metric, val, ref_val);
			}
			pixel_values[ch] = val;
		}

		this.params.PixelCoordinates.x = pixel_x;
		this.params.PixelCoordinates.y = pixel_y;
		this.params.PixelValues.x = pixel_values[0];
		this.params.PixelValues.y = pixel_values[1];
		this.params.PixelValues.z = pixel_values[2];
		this.gui.refresh();
	}

	canvas_mouse_leave (e: MouseEvent | null) {
		this.params.PixelCoordinates.x = -1.0;
		this.params.PixelCoordinates.y = -1.0;
		this.params.PixelValues.x = 0;
		this.params.PixelValues.y = 0;
		this.params.PixelValues.z = 0;
		this.gui.refresh();
	}

	setup_logic_sidebar() {
		if (!this.settings.enableSidebar) {
			return;
		}

		const getRootFontSize = () => {
			const htmlElement = this.root.querySelector('body')!;
			const styles = window.getComputedStyle(htmlElement);
			const fontSizeString = styles.fontSize;
			return parseFloat(fontSizeString);
		};

		const minWidth = 14.0 * getRootFontSize();

		const sidebar = this.root.getElementById('sidebar')!;
		const handle = this.root.getElementById('dragHandle')!;

		let isDragging = false;

		handle.addEventListener('mousedown', (e: MouseEvent) => {
			isDragging = true;
			document.body.style.userSelect = 'none'; // Prevent text selection
		});

		this.root.addEventListener('mousemove', (e__: Event) => {
			const e = e__ as MouseEvent;
			if (!isDragging) return;

			let newWidth = e.clientX;
			const maxWidth = window.innerWidth * 0.8;
			newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

			sidebar.style.width = newWidth + 'px';
		});


		this.root.addEventListener('mousemove', (e__: Event) => {
			const e = e__ as MouseEvent;
			if (!isDragging) return;

			let newWidth = e.clientX;
			const maxWidth = window.innerWidth * 0.8;
			newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

			sidebar.style.width = newWidth + 'px';
		});

		this.root.addEventListener('mouseup', (e__: Event) => {
			if (isDragging) {
				isDragging = false;
				document.body.style.userSelect = '';
				// Launch a resize event to update the size of the canvas
				this.window.dispatchEvent(new Event('resize'));
			}
		});
	}
	
	copy_image(e: ClipboardEvent) {
		if (e.clipboardData) {
			const [current_image, current_channel] = this.image_manager.get_current_image();
			if (current_image !== null && current_channel !== null) {
				this.spinner.style.display = '';
				const material = this.mesh.material as ShaderMaterial;
				this.image_saver.prepare(material, current_image.width, current_image.height);
				this.image_saver.copy_to_clipboard();

				this.root.querySelector('body')!.focus();

				e.preventDefault();
				e.stopPropagation();
				return false;
			}
		}
		return true;
	}
}

/*
	Entry point that initializes the viewer
*/
export function initViewer(root: HTMLElement, vscode: any, workers_paths: string[], settings: Types.SettingsDict) {
	return new Viewer(document, window, root, vscode, workers_paths, settings);
}
