extends CharacterBody3D
## Simple first-person controller.
## WASD / arrows to move, mouse to look, Space to jump, Shift to sprint.
## E picks up / drops whatever RigidBody3D you're looking at; click to throw it.
## Esc frees the mouse; click the window to capture it again.

const WALK_SPEED := 3.5
const SPRINT_SPEED := 6.0
const JUMP_VELOCITY := 4.5
const MOUSE_SENSITIVITY := 0.002
## How hard walking into a loose object shoves it (an acceleration, so light
## and heavy things move alike).
const PUSH_ACCEL := 20.0
## How far in front of the camera a held object floats.
const HOLD_DISTANCE := 1.4
## How snappily a held object follows that point.
const HOLD_STIFFNESS := 12.0
## A held object that gets stuck this far from that point is dropped.
const HOLD_BREAK_DISTANCE := 2.0
const THROW_SPEED := 7.0

var held: RigidBody3D

@onready var head: Node3D = $Head
@onready var camera: Camera3D = $Head/Camera
@onready var grab_ray: RayCast3D = $Head/Camera/GrabRay
@onready var prompt: Label = %PickupPrompt


func _ready() -> void:
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	grab_ray.add_exception(self)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-event.relative.x * MOUSE_SENSITIVITY)
		head.rotate_x(-event.relative.y * MOUSE_SENSITIVITY)
		head.rotation.x = clampf(head.rotation.x, deg_to_rad(-89.0), deg_to_rad(89.0))
	elif event.is_action_pressed("ui_cancel"):
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif event.is_action_pressed("interact"):
		if held:
			_release()
		else:
			_grab()
	elif event is InputEventMouseButton and event.pressed:
		if Input.mouse_mode != Input.MOUSE_MODE_CAPTURED:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
		elif held and event.button_index == MOUSE_BUTTON_LEFT:
			var thrown := held
			_release()
			thrown.linear_velocity = -camera.global_basis.z * THROW_SPEED


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity += get_gravity() * delta
	elif Input.is_action_just_pressed("jump"):
		velocity.y = JUMP_VELOCITY

	var input_dir := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
	var direction := (transform.basis * Vector3(input_dir.x, 0.0, input_dir.y)).normalized()
	var speed := SPRINT_SPEED if Input.is_action_pressed("sprint") else WALK_SPEED
	velocity.x = direction.x * speed
	velocity.z = direction.z * speed

	move_and_slide()

	# Shove anything loose we bump into (sideways only, so standing on it is fine).
	for i in get_slide_collision_count():
		var collision := get_slide_collision(i)
		var body := collision.get_collider() as RigidBody3D
		if body:
			var push := -collision.get_normal()
			push.y = 0.0
			body.apply_central_impulse(push * PUSH_ACCEL * body.mass * delta)

	if held:
		# Steer the held object toward a point in front of the camera.
		var target := camera.global_position - camera.global_basis.z * HOLD_DISTANCE
		var offset := target - held.global_position
		if offset.length() > HOLD_BREAK_DISTANCE:
			_release()
		else:
			held.linear_velocity = offset * HOLD_STIFFNESS
			held.angular_velocity = Vector3.ZERO

	_update_prompt()


func _grab() -> void:
	var body := grab_ray.get_collider() as RigidBody3D
	if body == null:
		return
	held = body
	held.freeze = false  # Things like the wall painting start frozen in place.
	add_collision_exception_with(held)


func _release() -> void:
	remove_collision_exception_with(held)
	held = null


func _update_prompt() -> void:
	if held:
		prompt.text = "E: drop    Click: throw"
	elif grab_ray.get_collider() is RigidBody3D:
		prompt.text = "E: pick up"
	else:
		prompt.text = ""
