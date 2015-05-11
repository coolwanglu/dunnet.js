questions_=cXVlc3Rpb25z
walkthrough_=d2Fsa3Rocm91Z2g=

all: meli.js $(questions_) $(walkthrough_)

meli.js: meli._js
	_node --standalone -c meli._js

$(questions_): questions.txt
	python -c "open('questions'.encode('base64')[:-1], 'w').write(open('questions.txt').read().encode('base64'))"

$(walkthrough_): walkthrough.txt
	python -c "open('walkthrough'.encode('base64')[:-1], 'w').write(open('walkthrough.txt').read().encode('base64'))"
