// Moteur 3D WebGL pour l'animation d'exoplanètes avec contrôles interactifs
class PlanetSystem3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!this.gl) {
            console.error('WebGL non supporté');
            return;
        }
        
        this.program = null;
        this.vertexBuffer = null;
        this.normalBuffer = null;
        this.uvBuffer = null;
        this.indexBuffer = null;
        
        // Variables d'animation
        this.time = 0;
        this.lastFrameTime = 0;
        this.orbitSpeed = 10;
        
        // Contrôles de caméra
        this.cameraControls = {
            distance: 12,
            minDistance: 3,
            maxDistance: 40,
            azimuth: 0,
            elevation: 0.3,
            targetAzimuth: 0,
            targetElevation: 0.3,
            targetDistance: 12,
            damping: 0.1,
            autoRotate: true,
            autoRotateSpeed: 0.15
        };
        
        // État de la souris
        this.mouse = {
            isDown: false,
            lastX: 0,
            lastY: 0,
            sensitivity: 0.005
        };
        
        // Caméra
        this.camera = {
            position: [8, 5, 8],
            target: [0, 0, 0],
            up: [0, 1, 0],
            fov: 80,
            near: 0.1,
            far: 500
        };
        
        // Matrices
        this.modelMatrix = mat4.create();
        this.viewMatrix = mat4.create();
        this.projectionMatrix = mat4.create();
        this.normalMatrix = mat3.create();
        
        // État de la planète actuelle
        this.currentPlanet = null;
        
        this.init();
        this.setupControls();
    }
    
    init() {
        this.setupShaders();
        this.setupBuffers();
        this.setupWebGL();
        this.animate();
    }
    
    setupControls() {
        // Rotation avec clic gauche
        this.canvas.addEventListener('mousedown', (e) => {
    console.log('Mousedown détecté'); // DEBUG
    this.mouse.isDown = true;
    this.mouse.lastX = e.clientX;
    this.mouse.lastY = e.clientY;
    this.canvas.style.cursor = 'grabbing';
});

        this.canvas.addEventListener('mousedown', (e) => {
            this.mouse.isDown = true;
            this.mouse.lastX = e.clientX;
            this.mouse.lastY = e.clientY;
            //
            this.cameraControls.autoRotate = false;
            this.canvas.style.cursor = 'grabbing';
        });
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.mouse.isDown) return;
            
            const deltaX = e.clientX - this.mouse.lastX;
            const deltaY = e.clientY - this.mouse.lastY;
            
            this.cameraControls.targetAzimuth -= deltaX * this.mouse.sensitivity;
            this.cameraControls.targetElevation += deltaY * this.mouse.sensitivity;
            
            // Pas de limitation - rotation complète possible
            
            this.mouse.lastX = e.clientX;
            this.mouse.lastY = e.clientY;
        });
        
        this.canvas.addEventListener('mouseup', () => {
            this.mouse.isDown = false;
            this.canvas.style.cursor = 'grab';
        });
        
        this.canvas.addEventListener('mouseleave', () => {
            this.mouse.isDown = false;
            this.canvas.style.cursor = 'grab';
        });
        
        // Zoom avec la molette
        this.canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const zoomSpeed = 0.1;
            const delta = e.deltaY > 0 ? 1 : -1;
            
            this.cameraControls.targetDistance *= (1 + delta * zoomSpeed);
            this.cameraControls.targetDistance = Math.max(
                this.cameraControls.minDistance,
                Math.min(this.cameraControls.maxDistance, this.cameraControls.targetDistance)
            );
            
            this.cameraControls.autoRotate = false;
        }, { passive: false });
        
        // Double-clic pour réinitialiser
        this.canvas.addEventListener('dblclick', () => {
            this.cameraControls.targetDistance = 12;
            this.cameraControls.targetAzimuth = 0;
            this.cameraControls.targetElevation = 0.3;
            this.cameraControls.autoRotate = true;
        });
        
        this.canvas.style.cursor = 'grab';
    }
    
    setupShaders() {
        const vertexShaderSource = `
            attribute vec3 position;
            attribute vec3 normal;
            attribute vec2 uv;
            
            uniform mat4 modelMatrix;
            uniform mat4 viewMatrix;
            uniform mat4 projectionMatrix;
            uniform mat3 normalMatrix;
            uniform vec3 lightPosition;
            
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying vec2 vUV;
            varying vec3 vLightDirection;
            
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = vec3(modelMatrix * vec4(position, 1.0));
                vUV = uv;
                vLightDirection = normalize(lightPosition - vPosition);
                
                gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
            }
        `;
        
        const fragmentShaderSource = `
            precision mediump float;
            
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying vec2 vUV;
            varying vec3 vLightDirection;
            
            uniform vec3 color;
            uniform vec3 ambientColor;
            uniform float shininess;
            uniform float time;
            
            void main() {
                float ambient = 0.99;
                float diffuse = max(dot(vNormal, vLightDirection), 0.0);
                float specular = 0.0;
                
                if (diffuse > 0.0) {
                    vec3 reflectDir = reflect(-vLightDirection, vNormal);
                    vec3 viewDir = normalize(-vPosition);
                    specular = pow(max(dot(reflectDir, viewDir), 0.0), shininess);
                }
                
                float twinkle = sin(time * 2.0 + vPosition.x * 10.0) * 0.1 + 0.9;
                
                vec3 finalColor = ambientColor * ambient + color * diffuse + vec3(1.0) * specular * 0.5;
                finalColor *= twinkle;
                
                gl_FragColor = vec4(finalColor, 1.0);
            }
        `;
        
        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        
        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);
        
        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Erreur de liaison du programme:', this.gl.getProgramInfoLog(this.program));
        }
        
        this.gl.useProgram(this.program);
        
        this.attributes = {
            position: this.gl.getAttribLocation(this.program, 'position'),
            normal: this.gl.getAttribLocation(this.program, 'normal'),
            uv: this.gl.getAttribLocation(this.program, 'uv')
        };
        
        this.uniforms = {
            modelMatrix: this.gl.getUniformLocation(this.program, 'modelMatrix'),
            viewMatrix: this.gl.getUniformLocation(this.program, 'viewMatrix'),
            projectionMatrix: this.gl.getUniformLocation(this.program, 'projectionMatrix'),
            normalMatrix: this.gl.getUniformLocation(this.program, 'normalMatrix'),
            lightPosition: this.gl.getUniformLocation(this.program, 'lightPosition'),
            color: this.gl.getUniformLocation(this.program, 'color'),
            ambientColor: this.gl.getUniformLocation(this.program, 'ambientColor'),
            shininess: this.gl.getUniformLocation(this.program, 'shininess'),
            time: this.gl.getUniformLocation(this.program, 'time')
        };
    }
    
    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Erreur de compilation du shader:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        
        return shader;
    }
    
    setupBuffers() {
        const sphere = this.createSphere(1, 64, 32);
        
        this.vertexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(sphere.positions), this.gl.STATIC_DRAW);
        
        this.normalBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(sphere.normals), this.gl.STATIC_DRAW);
        
        this.uvBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(sphere.uvs), this.gl.STATIC_DRAW);
        
        this.indexBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(sphere.indices), this.gl.STATIC_DRAW);
        
        this.vertexCount = sphere.indices.length;
    }
    
    createSphere(radius, segments, rings) {
        const positions = [];
        const normals = [];
        const uvs = [];
        const indices = [];
        
        for (let i = 0; i <= rings; i++) {
            const lat = Math.PI * (-0.5 + i / rings);
            const z = Math.sin(lat);
            const zr = Math.cos(lat);
            
            for (let j = 0; j <= segments; j++) {
                const lng = 2 * Math.PI * (j / segments);
                const x = Math.cos(lng) * zr;
                const y = Math.sin(lng) * zr;
                
                positions.push(x * radius, z * radius, y * radius);
                normals.push(x, z, y);
                uvs.push(1 - j / segments, 1 - i / rings);
            }
        }
        
        for (let i = 0; i < rings; i++) {
            for (let j = 0; j < segments; j++) {
                const first = (i * (segments + 1)) + j;
                const second = first + segments + 1;
                
                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }
        
        return { positions, normals, uvs, indices };
    }
    
    setupWebGL() {
        this.gl.enable(this.gl.DEPTH_TEST);
        this.gl.enable(this.gl.CULL_FACE);
        this.gl.cullFace(this.gl.BACK);
        this.gl.clearColor(0.05, 0.05, 0.15, 1.0);
        this.gl.depthFunc(this.gl.LEQUAL);
        this.gl.clearDepth(1.0);
    }
    
    updateCamera() {
        // Interpolation douce pour les contrôles
        this.cameraControls.azimuth += (this.cameraControls.targetAzimuth - this.cameraControls.azimuth) * this.cameraControls.damping;
        this.cameraControls.elevation += (this.cameraControls.targetElevation - this.cameraControls.elevation) * this.cameraControls.damping;
        this.cameraControls.distance += (this.cameraControls.targetDistance - this.cameraControls.distance) * this.cameraControls.damping;
        
        // Rotation automatique si activée
        if (this.cameraControls.autoRotate) {
            this.cameraControls.targetAzimuth = this.time * this.cameraControls.autoRotateSpeed * 2;
            this.cameraControls.targetElevation = 0.3 + Math.sin(this.time * 0.1) * 0.15;
        }
        
        // Calcul de la position de la caméra en coordonnées sphériques
        const x = this.cameraControls.distance * Math.cos(this.cameraControls.elevation) * Math.cos(this.cameraControls.azimuth);
        const y = this.cameraControls.distance * Math.sin(this.cameraControls.elevation);
        const z = this.cameraControls.distance * Math.cos(this.cameraControls.elevation) * Math.sin(this.cameraControls.azimuth);
        
        this.camera.position[0] = x;
        this.camera.position[1] = y;
        this.camera.position[2] = z;
        
        mat4.lookAt(this.viewMatrix, this.camera.position, this.camera.target, this.camera.up);
    }
    
    updateProjection() {
        const aspect = this.canvas.width / this.canvas.height;
        mat4.perspective(this.projectionMatrix, this.camera.fov * Math.PI / 180, aspect, this.camera.near, this.camera.far);
    }
    
    setPlanet(planet) {
        this.currentPlanet = planet;
    }
    
    drawStar(planet) {
        if (!planet) return;
        
        mat4.identity(this.modelMatrix);
        const starSize = Math.max(0.5, Math.min(1.2, (planet.star_rad_rsun || 1) * 0.3));
        mat4.scale(this.modelMatrix, this.modelMatrix, [starSize, starSize, starSize]);
        mat4.rotateY(this.modelMatrix, this.modelMatrix, this.time * 0);
        
        mat3.normalFromMat4(this.normalMatrix, this.modelMatrix);
        
        this.gl.uniformMatrix4fv(this.uniforms.modelMatrix, false, this.modelMatrix);
        this.gl.uniformMatrix4fv(this.uniforms.viewMatrix, false, this.viewMatrix);
        this.gl.uniformMatrix4fv(this.uniforms.projectionMatrix, false, this.projectionMatrix);
        this.gl.uniformMatrix3fv(this.uniforms.normalMatrix, false, this.normalMatrix);
        
        const starColor = this.getStarColor(planet.teff_k);
        this.gl.uniform3fv(this.uniforms.color, starColor);
        this.gl.uniform3fv(this.uniforms.ambientColor, starColor);
        this.gl.uniform1f(this.uniforms.shininess, 1000.0);
        this.gl.uniform3fv(this.uniforms.lightPosition, [0, 0, 0]);
        this.gl.uniform1f(this.uniforms.time, this.time);
        
        this.drawSphere();
    }
    
    drawPlanet(planet) {
        if (!planet) return;
        
        const orbitRadius = Math.max(3.0, Math.min(7, (planet.a_over_rstar || 10) * 0.2));
        const orbitAngle = this.time * this.orbitSpeed / (planet.period_days || 1);
        
        const planetX = Math.cos(orbitAngle) * orbitRadius;
        const planetZ = Math.sin(orbitAngle) * orbitRadius;
        const planetY = 0;
        
        mat4.identity(this.modelMatrix);
        mat4.translate(this.modelMatrix, this.modelMatrix, [planetX, planetY, planetZ]);
        
        const planetSize = Math.max(0.2, Math.min(0.8, (planet.radius_rearth || 1) * 0.1));
        mat4.scale(this.modelMatrix, this.modelMatrix, [planetSize, planetSize, planetSize]);
        mat4.rotateY(this.modelMatrix, this.modelMatrix, this.time * 0);
        
        mat3.normalFromMat4(this.normalMatrix, this.modelMatrix);
        
        this.gl.uniformMatrix4fv(this.uniforms.modelMatrix, false, this.modelMatrix);
        this.gl.uniformMatrix3fv(this.uniforms.normalMatrix, false, this.normalMatrix);
        
        const planetColor = this.getPlanetColor(planet.eq_temp_k);
        this.gl.uniform3fv(this.uniforms.color, planetColor);
        this.gl.uniform3fv(this.uniforms.ambientColor, planetColor.map(c => c * 0.2));
        this.gl.uniform1f(this.uniforms.shininess, 100);
        this.gl.uniform3fv(this.uniforms.lightPosition, [0, 0, 0]);
        this.gl.uniform1f(this.uniforms.time, this.time);
        
        this.drawSphere();
        
        this.drawOrbit(orbitRadius);
    }
    
    drawOrbit(radius) {
        this.gl.depthMask(true);
        this.gl.lineWidth(2.0);
        
        const orbitPoints = 128;
        const positions = [];
        
        for (let i = 0; i <= orbitPoints; i++) {
            const angle = (i / orbitPoints) * Math.PI * 2;
            positions.push(
                Math.cos(angle) * radius, 
                0, 
                Math.sin(angle) * radius
            );
        }
        
        const orbitBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, orbitBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);
        
        mat4.identity(this.modelMatrix);
        this.gl.uniformMatrix4fv(this.uniforms.modelMatrix, false, this.modelMatrix);
        this.gl.uniform3fv(this.uniforms.color, [1.0, 1.0, 1.0]);
        this.gl.uniform1f(this.uniforms.shininess, 100);
        this.gl.uniform3fv(this.uniforms.ambientColor, [1.0, 1.0, 1.0]);
        
        this.gl.enableVertexAttribArray(this.attributes.position);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, orbitBuffer);
        this.gl.vertexAttribPointer(this.attributes.position, 3, this.gl.FLOAT, false, 0, 0);
        
        this.gl.disableVertexAttribArray(this.attributes.normal);
        this.gl.disableVertexAttribArray(this.attributes.uv);
        
        this.gl.drawArrays(this.gl.LINE_STRIP, 0, positions.length / 3);
        
        this.gl.deleteBuffer(orbitBuffer);
    }
    
    drawSphere() {
        this.gl.enableVertexAttribArray(this.attributes.position);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
        this.gl.vertexAttribPointer(this.attributes.position, 3, this.gl.FLOAT, false, 0, 0);
        
        this.gl.enableVertexAttribArray(this.attributes.normal);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.normalBuffer);
        this.gl.vertexAttribPointer(this.attributes.normal, 3, this.gl.FLOAT, false, 0, 0);
        
        this.gl.enableVertexAttribArray(this.attributes.uv);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuffer);
        this.gl.vertexAttribPointer(this.attributes.uv, 2, this.gl.FLOAT, false, 0, 0);
        
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        this.gl.drawElements(this.gl.TRIANGLES, this.vertexCount, this.gl.UNSIGNED_SHORT, 0);
    }
    
    getStarColor(teff) {
        if (teff > 6000) return [1.0, 1.0, 1.0];
        if (teff > 5000) return [1.0, 1.0, 0.7];
        if (teff > 4000) return [1.0, 0.6, 0.3];
        if (teff > 3000) return [1.0, 0.3, 0.3];
        return [0.8, 0.2, 0.2];
    }
    
    getPlanetColor(eqTemp) {
        if (eqTemp > 1000) return [1.0, 0.4, 0.4];
        if (eqTemp > 500) return [1.0, 0.6, 0.3];
        if (eqTemp > 273) return [0.4, 0.6, 1.0];
        if (eqTemp > 200) return [0.6, 0.6, 1.0];
        return [0.7, 0.7, 0.7];
    }
    
    animate() {
        const now = performance.now();
        const deltaTime = (now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;
        
        this.time += deltaTime;
        
        this.updateCamera();
        this.updateProjection();
        
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        
        if (this.currentPlanet) {
            this.drawStar(this.currentPlanet);
            this.drawPlanet(this.currentPlanet);
        }
        
        requestAnimationFrame(() => this.animate());
    }
    
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
}

// Bibliothèque de matrices (version simplifiée)
const mat4 = {
    create() { return new Float32Array(16); },
    identity(out) {
        out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
        out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
        return out;
    },
    perspective(out, fovy, aspect, near, far) {
        const f = 1.0 / Math.tan(fovy / 2);
        out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = (far + near) / (near - far); out[11] = -1;
        out[12] = 0; out[13] = 0; out[14] = (2 * far * near) / (near - far); out[15] = 0;
        return out;
    },
    lookAt(out, eye, center, up) {
        const eyex = eye[0], eyey = eye[1], eyez = eye[2];
        const upx = up[0], upy = up[1], upz = up[2];
        const centerx = center[0], centery = center[1], centerz = center[2];
        
        let z0 = eyex - centerx, z1 = eyey - centery, z2 = eyez - centerz;
        let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
        z0 *= len; z1 *= len; z2 *= len;
        
        let x0 = upy * z2 - upz * z1, x1 = upz * z0 - upx * z2, x2 = upx * z1 - upy * z0;
        len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
        if (!len) { x0 = 0; x1 = 0; x2 = 0; }
        else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }
        
        let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
        
        out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
        out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
        out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
        out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
        out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
        out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
        out[15] = 1;
        return out;
    },
    translate(out, a, v) {
        const x = v[0], y = v[1], z = v[2];
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
        return out;
    },
    rotateY(out, a, rad) {
        const s = Math.sin(rad), c = Math.cos(rad);
        const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
        const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
        
        out[0] = a00 * c - a20 * s; out[1] = a01 * c - a21 * s; out[2] = a02 * c - a22 * s; out[3] = a03 * c - a23 * s;
        out[8] = a00 * s + a20 * c; out[9] = a01 * s + a21 * c; out[10] = a02 * s + a22 * c; out[11] = a03 * s + a23 * c;
        return out;
    },
    scale(out, a, v) {
        const x = v[0], y = v[1], z = v[2];
        out[0] = a[0] * x; out[1] = a[1] * x; out[2] = a[2] * x; out[3] = a[3] * x;
        out[4] = a[4] * y; out[5] = a[5] * y; out[6] = a[6] * y; out[7] = a[7] * y;
        out[8] = a[8] * z; out[9] = a[9] * z; out[10] = a[10] * z; out[11] = a[11] * z;
        return out;
    }
};

const mat3 = {
    create() { return new Float32Array(9); },
    normalFromMat4(out, a) {
        const a00 = a[0], a01 = a[1], a02 = a[2];
        const a10 = a[4], a11 = a[5], a12 = a[6];
        const a20 = a[8], a21 = a[9], a22 = a[10];

        const b01 = a22 * a11 - a12 * a21;
        const b11 = -a22 * a10 + a12 * a20;
        const b21 = a21 * a10 - a11 * a20;

        let det = a00 * b01 + a01 * b11 + a02 * b21;
        if (!det) return null;
        det = 1.0 / det;

        out[0] = b01 * det;
        out[1] = (-a22 * a01 + a02 * a21) * det;
        out[2] = (a12 * a01 - a02 * a11) * det;
        out[3] = b11 * det;
        out[4] = (a22 * a00 - a02 * a20) * det;
        out[5] = (-a12 * a00 + a02 * a10) * det;
        out[6] = b21 * det;
        out[7] = (-a21 * a00 + a01 * a20) * det;
        out[8] = (a11 * a00 - a01 * a10) * det;

        return out;
    }
};
