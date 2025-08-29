import * as Types from './types/viewer';
import { WebGLRenderer, Scene, OrthographicCamera, Mesh, Vector2, Vector3, ShaderMaterial, PlaneGeometry, NearestFilter, LinearFilter, Texture, Matrix4, Quaternion } from 'three';

export class Saver {
    material!: ShaderMaterial;
    width!: number;
    height!: number;
    scene!: Scene;
    camera!: OrthographicCamera;
    renderer!: WebGLRenderer;
    vscode: any;
    spinner: HTMLElement;

    constructor(vscode: any, spinner: HTMLElement) {
        this.vscode = vscode;
        this.spinner = spinner;

        // Init the new renderer / scene
        const canvas = document.createElement('canvas');
        this.renderer = new WebGLRenderer({ preserveDrawingBuffer: true, canvas: canvas });
        this.scene = new Scene();
    }

    prepare(material: ShaderMaterial, width: number, height: number) {
        this.material = material.clone();
        this.width = width;
        this.height = height;

        this.scene.clear();

        this.renderer.setSize(this.width, this.height);

        const aspect = this.width / this.height;
        this.camera = new OrthographicCamera(
            10 * aspect / -2,
            10 * aspect / 2,
            10 / 2,
            10 / -2,
            1,
            1000
        );
        this.camera.position.set(0, 0, 10);
        this.camera.lookAt(0, 0, 0);

        const visibleWidth = this.camera.right - this.camera.left;
        const visibleHeight = this.camera.top - this.camera.bottom;
        const quad_bg = new PlaneGeometry(visibleWidth, visibleHeight);
        const mesh = new Mesh(quad_bg, this.material);
        mesh.position.set(0, 0, 0);
        this.scene.add(mesh);
    }

    render() {
        // Set default values to render all the images
        this.material.uniforms.img_aspect_offset.value = new Vector2(0, 0);
        this.material.uniforms.img_aspect_scaling.value = new Vector2(1, 1);
        this.material.uniforms.imgAlt_aspect_offset.value = new Vector2(0, 0);
        this.material.uniforms.imgAlt_aspect_scaling.value = new Vector2(1, 1);
        this.material.needsUpdate = true;

        this.renderer.render(this.scene, this.camera);
        const canvas = this.renderer.domElement;

        /*
            The most efficient way to get the blob is in theory canvas.toBlob(),
            but it is asynchronous and generates a huge latency spike 
            (unless the user does an inmediate interaction with the webview).
            So we use the dataURL approach instead, which is synchronous 
            and faster.
        */

        function dataURLtoBlob(dataurl: string) {
            const arr = dataurl.split(',');
            const mime = arr[0].match(/:(.*?);/)![1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8arr = new Uint8Array(n);

            while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
            }

            return new Blob([u8arr], { type: mime });
        }

        const dataURL = canvas.toDataURL('image/png');
        const blob = dataURLtoBlob(dataURL);
        return new Promise<Blob>((resolve) => resolve(blob));
    }

    copy_to_clipboard() {
        const promise = this.render();

        promise.then((blob: Blob) => {
            const clipboardItem = new ClipboardItem({
                'image/png': blob
            });

            navigator.clipboard.write([clipboardItem]).then(() => {
                console.log('Image copied to clipboard!');
                this.spinner.style.display = 'none';
            });
        }).catch((error) => {
            console.error('Error rendering image for clipboard:', error);
        });
    }

    save_to_file(filename: string) {
        const promise = this.render();

        promise.then((blob: Blob) => {
            blob.arrayBuffer().then(buffer => {
                const uint8Array = new Uint8Array(buffer);
                console.log('Saving image to file...', filename);
                this.vscode.postMessage({ command: 'write_file', data: uint8Array, default_filename: filename });
                this.spinner.style.display = 'none';
            });
        }).catch((error) => {
            console.error('Error rendering image for saving:', error);
        });
    }
}
