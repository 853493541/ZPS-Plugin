local filename = arg[1]
local loader, err = loadfile(filename, 't', {})
assert(loader, err)
local data = loader()
assert(type(data) == 'table')
assert(type(data.tBuff) == 'table')
assert(type(data.tClass) == 'table')
local buffs, classes = 0, 0
for id, rule in pairs(data.tBuff) do
  assert(type(id) == 'number')
  assert(type(rule.tLevel) == 'table')
  assert(type(rule.nPower) == 'number')
  buffs = buffs + 1
end
for key in pairs(data.tClass) do
  assert(type(key) == 'string')
  classes = classes + 1
end
print('Lua reader passed: ' .. buffs .. ' buffs, ' .. classes .. ' classes')
